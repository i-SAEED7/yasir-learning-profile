import {onCall,HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {randomBytes,scryptSync,timingSafeEqual,randomUUID,createHash} from "node:crypto";

initializeApp();
const db=getFirestore();
const PEPPER=defineSecret("YASIR_PIN_PEPPER");
const ADMIN_PIN=defineSecret("YASIR_ADMIN_PIN");
const options={region:"me-central2",maxInstances:10};
const subjects=new Set(["الرياضيات","اللغة الإنجليزية","الأحياء","التربية الصحية والبدنية","التربية المهنية","التفكير الناقد","التقنية الرقمية","الحديث","الدراسات الاجتماعية","الفيزياء","القرآن الكريم والتفسير","الكفايات اللغوية","الكيمياء","المعرفة المالية","علم البيئة"]);
const periods=new Set(["فترة أولى","فترة ثانية","نهاية الفصل"]);
const tests=new Set(["تقويمية تحريرية","المهام الأدائية والمشاركة والتفاعل"]);
const validClass=c=>/^1\/[1-8]$/.test(c);
function error(message,code="invalid-argument"){throw new HttpsError(code,message)}
function secretHash(pin,salt){return scryptSync(pin+PEPPER.value(),salt,64).toString("hex")}
function makeHash(pin){const salt=randomBytes(24).toString("hex");return {salt,digest:secretHash(pin,salt)}}
function matches(pin,hash){if(!hash?.salt||!hash?.digest)return false;try{const a=Buffer.from(secretHash(pin,hash.salt),"hex"),b=Buffer.from(hash.digest,"hex");return a.length===b.length&&timingSafeEqual(a,b)}catch{return false}}
function isValid(subject,period,test){if(!subjects.has(subject)||!periods.has(period)||!tests.has(test))error("المادة أو الفترة أو الاختبار غير صالح")}
function docKey(parts){return createHash("sha256").update(JSON.stringify(parts)).digest("hex")}
function audit(type,who,details){return {type,who,details,createdAt:FieldValue.serverTimestamp()}}
async function user(req,adminOnly=false){
 if(!req.auth?.uid)error("تسجيل الدخول مطلوب","unauthenticated");
 const snap=await db.collection("sessions").doc(req.auth.uid).get();
 if(!snap.exists||snap.data().revoked||snap.data().expiresAt.toMillis()<Date.now())error("انتهت الجلسة","unauthenticated");
 const s=snap.data();
 if(adminOnly&&s.role!=="admin")error("صلاحية المنسق مطلوبة","permission-denied");
 if(s.role==="teacher"){
  const g=await db.collection("groups").doc(s.groupId).get();
  if(!g.exists||!g.data().enabled)error("رمز المجموعة غير فعال","permission-denied");
  if((s.groupVersion??1)!==(g.data().version??1))error("تغيرت صلاحيات المجموعة، الرجاء تسجيل الدخول مجددًا","unauthenticated");
  return {role:"teacher",uid:req.auth.uid,groupId:s.groupId,...{subject:g.data().subject,classes:g.data().classes}};
 }
 return {role:"admin",uid:req.auth.uid};
}
async function rateLimit(req){
 const ip=req.rawRequest.ip||"unknown";
 const id=docKey([ip,"login"]),ref=db.collection("loginAttempts").doc(id);
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref),v=snap.data()||{n:0,until:0};
  const now=Date.now(),n=now>v.until?0:v.n;
  if(n>=10)error("محاولات كثيرة. حاول لاحقًا","resource-exhausted");
  tx.set(ref,{n:n+1,until:now+15*60*1000,expiresAt:new Date(now+24*60*60*1000)});
 });
}
export const loginWithPin=onCall({...options,secrets:[PEPPER,ADMIN_PIN]},async req=>{
 const {subject,pin,admin=false}=req.data||{};
 if(typeof pin!=="string"||pin.length<8||pin.length>128)error("الرمز غير صحيح","unauthenticated");
 await rateLimit(req);
 let role,groupId=null,groupVersion=null;
 if(admin){
   const a=Buffer.from(createHash("sha256").update(pin).digest("hex"),"hex");
   const b=Buffer.from(createHash("sha256").update(ADMIN_PIN.value()).digest("hex"),"hex");
   if(!timingSafeEqual(a,b))error("رمز غير صحيح","unauthenticated");
   role="admin";
 }else{
   if(!subjects.has(subject))error("المادة غير صحيحة");
   const snap=await db.collection("groups").where("subject","==",subject).where("enabled","==",true).get();
   const found=snap.docs.find(d=>matches(pin,d.data().pinHash));
   if(!found)error("رمز غير صحيح","unauthenticated");
   role="teacher";groupId=found.id;groupVersion=found.data().version??1;
 }
 const uid="ys-"+randomUUID(),expiresAt=new Date(Date.now()+2*60*60*1000);
 await db.collection("sessions").doc(uid).set({role,groupId,groupVersion,revoked:false,expiresAt});
 const token=await getAuth().createCustomToken(uid,{ysRole:role});
 return {token,role,expiresAt:expiresAt.toISOString()};
});
export const loadPortal=onCall(options,async req=>{
 const u=await user(req),out={role:u.role,students:[],groups:[],locks:[],records:[]};
 if(u.role==="admin"){
  for(const name of ["students","groups","locks","grades"]){
   const docs=await db.collection(name).limit(2000).get();
   out[name==="grades"?"records":name]=docs.docs.filter(d=>name!=="students"||!d.data().archived).map(d=>{const {pinHash,...data}=d.data();return {id:d.id,...data};});
  }
 }else{
  const docs=await db.collection("students").where("class","in",u.classes).get();
  out.students=docs.docs.map(d=>({id:d.id,...d.data()})).filter(s=>!s.archived&&Array.isArray(s.subjects)&&s.subjects.includes(u.subject));
  const records=await db.collection("grades").where("subject","==",u.subject).get();
  const ids=new Set(out.students.map(s=>s.id));
  out.records=records.docs.map(d=>({id:d.id,...d.data()})).filter(r=>ids.has(r.studentId));
  const locks=await db.collection("locks").where("subject","==",u.subject).get();
  out.locks=locks.docs.map(d=>({id:d.id,...d.data()}));
 }
 return out;
});
export const saveGrade=onCall(options,async req=>{
 const u=await user(req),{studentId,subject,period,test,value}=req.data||{};
 isValid(subject,period,test);
 if(typeof value!=="number"||!Number.isFinite(value)||value<0)error("الدرجة يجب أن تكون رقمًا غير سالب");
 if(typeof studentId!=="string")error("الطالب غير صحيح");
 if(u.role!=="admin"&&u.subject!==subject)error("المادة غير مصرح بها","permission-denied");
 const studentRef=db.collection("students").doc(studentId),lockRef=db.collection("locks").doc(docKey([subject,period,test])),gradeRef=db.collection("grades").doc(docKey([studentId,subject,period,test]));
 await db.runTransaction(async tx=>{
  const [student,lock,old]=await Promise.all([tx.get(studentRef),tx.get(lockRef),tx.get(gradeRef)]);
  if(!student.exists||student.data().archived||!Array.isArray(student.data().subjects)||!student.data().subjects.includes(subject))error("الطالب غير مسند للمادة أو مؤرشف","permission-denied");
  if(u.role!=="admin"&&!u.classes.includes(student.data().class))error("الفصل غير مصرح به","permission-denied");
  if(u.role!=="admin"&&lock.data()?.closed)error("التقييم مغلق","permission-denied");
  tx.set(gradeRef,{studentId,subject,period,test,value,updatedAt:FieldValue.serverTimestamp()});
  tx.create(db.collection("audit").doc(),audit("saveGrade",u.role==="admin"?"admin":u.groupId,{studentId,subject,period,test,previous:old.data()?.value??null,value}));
 });
 return {ok:true};
});
export const upsertStudent=onCall(options,async req=>{
 const u=await user(req,true),{id,name,class:cls,subjects:assigned}=req.data||{};
 if(typeof name!=="string"||name.trim().length<3||name.length>90||!validClass(cls)||!Array.isArray(assigned)||!assigned.length||assigned.some(s=>!subjects.has(s)))error("بيانات الطالب غير صحيحة");
 if(id!==undefined&&(typeof id!=="string"||id.length>128))error("معرف الطالب غير صالح");
 const studentId=id||randomUUID();
 await db.collection("students").doc(studentId).set({name:name.trim(),class:cls,subjects:[...new Set(assigned)],archived:false,updatedAt:FieldValue.serverTimestamp()});
 await db.collection("audit").add(audit("upsertStudent",u.uid,{studentId}));return {id:studentId};
});
export const removeStudent=onCall(options,async req=>{
 const u=await user(req,true),id=req.data?.id;
 if(typeof id!=="string")error("المعرّف غير صالح");
 // Soft-delete: keep grade history and audit trail.
 await db.collection("students").doc(id).update({archived:true,updatedAt:FieldValue.serverTimestamp()});
 await db.collection("audit").add(audit("archiveStudent",u.uid,{id}));return {ok:true};
});
export const upsertGroup=onCall({...options,secrets:[PEPPER]},async req=>{
 const u=await user(req,true),{id,subject,label,classes,pin}=req.data||{};
 if(!subjects.has(subject)||typeof label!=="string"||!label.trim()||label.length>80||
    !Array.isArray(classes)||!classes.length||classes.length>8||classes.some(c=>!validClass(c)))error("بيانات المجموعة غير صحيحة");
 if(id!==undefined&&(typeof id!=="string"||id.length>128))error("معرف المجموعة غير صالح");
 const old=id?await db.collection("groups").doc(id).get():null;
 if(id&&!old?.exists)error("المجموعة غير موجودة","not-found");
 if(!id&&(typeof pin!=="string"||pin.length<12||pin.length>128))error("رمز المجموعة الجديد يجب أن يتكون من 12 حرفًا على الأقل");
 if(id&&pin!==undefined&&(typeof pin!=="string"||pin.length<12||pin.length>128))error("رمز المجموعة يجب أن يتكون من 12 حرفًا على الأقل");
 const others=await db.collection("groups").where("subject","==",subject).where("enabled","==",true).get();
 if(others.docs.some(d=>d.id!==id&&d.data().classes.some(c=>classes.includes(c))))error("يوجد فصل مسند لمجموعة أخرى في المادة");
 const groupId=id||randomUUID(),data={
   subject,label:label.trim(),classes:[...new Set(classes)],enabled:true,
   version:(old?.data()?.version??0)+1,updatedAt:FieldValue.serverTimestamp()
 };
 if(pin!==undefined)data.pinHash=makeHash(pin);
 else if(old?.exists)data.pinHash=old.data().pinHash;
 else error("رمز المجموعة مطلوب");
 await db.collection("groups").doc(groupId).set(data);
 await db.collection("audit").add(audit("upsertGroup",u.uid,{groupId,subject,classes,revokedPreviousSessions:!!id}));
 return {id:groupId};
});
export const disableGroup=onCall(options,async req=>{
 const u=await user(req,true),id=req.data?.id;
 if(typeof id!=="string")error("المعرف غير صالح");
 await db.collection("groups").doc(id).update({enabled:false});
 await db.collection("audit").add(audit("disableGroup",u.uid,{id}));return {ok:true};
});
export const setLocks=onCall(options,async req=>{
 const u=await user(req,true),{subject,period,test,closed,allSubjects=false,allPeriods=false,allTests=false}=req.data||{};
 if(typeof closed!=="boolean")error("الحالة غير صحيحة");
 const ss=allSubjects?[...subjects]:[subject],ps=allPeriods?[...periods]:[period],tt=allTests?[...tests]:[test];
 for(const s of ss)for(const p of ps)for(const t of tt)isValid(s,p,t);
 const batch=db.batch();
 for(const s of ss)for(const p of ps)for(const t of tt)batch.set(db.collection("locks").doc(docKey([s,p,t])),{subject:s,period:p,test:t,closed,updatedAt:FieldValue.serverTimestamp()});
 await batch.commit();await db.collection("audit").add(audit("setLocks",u.uid,{subject,period,test,closed,allSubjects,allPeriods,allTests}));return {ok:true};
});
export const exportGrades=onCall(options,async req=>{
 await user(req,true);
 const snap=await db.collection("grades").limit(3001).get();
 if(snap.size>3000)error("تجاوز عدد السجلات حد التصدير؛ يلزم استخدام التصدير الدفعي","resource-exhausted");
 return snap.docs.map(d=>d.data());
});
