import {initializeApp} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {getAuth,setPersistence,browserSessionPersistence,inMemoryPersistence,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,deleteUser} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {getFirestore,doc,collection,getDoc,getDocs,setDoc,updateDoc,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {firebaseConfig} from "../secure/config.js";

const SUBJECTS=["الرياضيات","اللغة الإنجليزية","الأحياء","التربية الصحية والبدنية","التربية المهنية","التفكير الناقد","التقنية الرقمية","الحديث","الدراسات الاجتماعية","الفيزياء","القرآن الكريم والتفسير","الكفايات اللغوية","الكيمياء","المعرفة المالية","علم البيئة"];
const PERIODS=["فترة أولى","فترة ثانية","نهاية الفصل"],TESTS=["تقويمية تحريرية","المهام الأدائية والمشاركة والتفاعل"];
const CLASSES=Array.from({length:8},(_,i)=>"c"+(i+1));
const $=id=>document.getElementById(id),subId=i=>"s"+i,subjectName=id=>SUBJECTS[Number(id?.slice(1))]||"غير معروف";
const className=id=>"1/"+id?.slice(1),classId=label=>"c"+label.split("/")[1];
const safe=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const html=(name,label="")=>'<div class="bar"><div><span class="eyebrow">'+safe(label)+'</span><h2 class="h">'+safe(name)+'</h2></div></div>';
const btn=(name,id,style="")=>'<button type="button" id="'+id+'" class="btn '+style+'">'+safe(name)+'</button>';
const select=(id,label,items,value)=>'<div class="field"><label for="'+id+'">'+safe(label)+'</label><select id="'+id+'">'+items.map(([v,t])=>'<option value="'+safe(v)+'" '+(v===value?"selected":"")+'>'+safe(t)+'</option>').join("")+'</select></div>';
const subs=SUBJECTS.map((v,i)=>[subId(i),v]), periods=PERIODS.map((v,i)=>["p"+i,v]), tests=TESTS.map((v,i)=>["t"+i,v]), classrooms=CLASSES.map(v=>[v,className(v)]);
const groupEmail=async(subject,code)=>{
 const input=new TextEncoder().encode("ys-v1|"+subject+"|"+code);
 const digest=await crypto.subtle.digest("SHA-256",input);
 const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
 return "yg-"+hex.slice(0,40)+"@groups.yasir.example.com";
};
const codeGenerate=()=>{const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";const bytes=crypto.getRandomValues(new Uint8Array(20));return [...bytes].map(n=>alphabet[n%alphabet.length]).join("")};
const gradeId=(s,c,id,p,t)=>[s,c,id,p,t].join("_"),lockId=(s,p,t)=>[s,p,t].join("_");
const docArr=snap=>snap.docs.map(d=>({id:d.id,...d.data()}));
const labelsForClasses=v=>v.map(className).join("، ");
let auth,db,regAuth,role="",page="subjects",subjectId="",group=null,students=[],groups=[],locks=[],selected=null,grades={},period="p0",test="all",tab="locks",busy=false,renderVersion=0;
function flash(msg){const t=$("toast");if(!t)return;t.textContent=msg;t.hidden=false;clearTimeout(flash.timer);flash.timer=setTimeout(()=>t.hidden=true,4700)}
function explain(e){
 console.error("Firebase:",e?.code||"error");
 if(e?.code==="auth/operation-not-allowed")return "فعّل تسجيل الدخول بالبريد وكلمة المرور في Firebase Authentication";
 if(e?.code==="auth/invalid-credential"||e?.code==="auth/invalid-email"||e?.code==="auth/wrong-password")return "رمز الدخول أو بيانات الحساب غير صحيحة";
 if(e?.code==="auth/email-already-in-use")return "هذا الرمز مستخدم؛ اختر رمزًا جديدًا للمجموعة";
 if(e?.code==="permission-denied")return "رفضت Firestore العملية. تحقق من نشر قواعد الأمان ومن تفعيل صلاحيات حساب المنسق";
 if(e?.code==="unavailable")return "تعذّر الوصول إلى Firestore. تحقق من إنشاء قاعدة البيانات (default) في Firebase ومن اتصال الشبكة، ثم أعد المحاولة";
 if(e?.code==="failed-precondition")return "إعداد قاعدة Firestore غير مكتمل. تحقق من وجود قاعدة البيانات (default) في مشروع Firebase";
 if(e?.message==="admin-required")return "الحساب ليس مخولًا بصفة منسق؛ راجع سجل ys_admins";
 if(e?.message==="group-disabled")return "رمز المجموعة غير فعال أو لا يتبع المادة المختارة";
 return "تعذّرت العملية، ولم يتأكد حفظ البيانات. "+String(e?.code||"");
}
async function task(fn){
 if(busy)return;
 busy=true;
 const items=[...document.querySelectorAll("button")],disabled=items.map(x=>x.disabled);
 items.forEach(x=>x.disabled=true);
 try{await fn()}catch(e){flash(explain(e))}finally{
  busy=false;items.forEach((x,i)=>{if(x.isConnected)x.disabled=disabled[i]})
 }
}
const adminDoc=uid=>doc(db,"ys_admins",uid);
const groupDoc=uid=>doc(db,"ys_groups",uid);
const studentDoc=id=>doc(db,"ys_students",id);
const enrollCol=(s,c)=>collection(db,"ys_enrollments",s,"classes",c,"members");
const enrollDoc=(s,c,id)=>doc(db,"ys_enrollments",s,"classes",c,"members",id);
const lockDoc=(s,p,t)=>doc(db,"ys_locks",lockId(s,p,t));
const gradeDoc=(s,c,id,p,t)=>doc(db,"ys_grades",gradeId(s,c,id,p,t));
const logDoc=()=>doc(collection(db,"ys_audit"));
const audit=(action,details)=>({action,details,actorUid:auth.currentUser.uid,createdAt:serverTimestamp()});
async function load(){
 if(!auth?.currentUser)throw Error("not-authenticated");
 const isA=await getDoc(adminDoc(auth.currentUser.uid));
 if(isA.exists()&&isA.data().active===true){
  role="admin";group=null;
  const [st,gr,lo]=await Promise.all([getDocs(collection(db,"ys_students")),getDocs(collection(db,"ys_groups")),getDocs(collection(db,"ys_locks"))]);
  students=docArr(st);groups=docArr(gr);locks=docArr(lo);
  return;
 }
 if(!subjectId)throw Error("admin-required");
 const groupSnap=await getDoc(groupDoc(auth.currentUser.uid));
 if(!groupSnap.exists()||groupSnap.data().enabled!==true)throw Error("group-disabled");
 const current={id:groupSnap.id,...groupSnap.data()};
 if(subjectId&&current.subjectId!==subjectId)throw Error("group-disabled");
 role="teacher";group=current;subjectId=current.subjectId;groups=[];students=[];
 const promises=(current.classes||[]).map(c=>getDocs(enrollCol(subjectId,c)));
 const all=await Promise.all(promises);
 students=all.flatMap(docArr).sort((a,b)=>a.classId.localeCompare(b.classId)||a.name.localeCompare(b.name,"ar"));
 const lo=await getDocs(collection(db,"ys_locks"));locks=docArr(lo);
}
async function enterAdmin(email,password){
 await signInWithEmailAndPassword(auth,email,password);
 try{
  subjectId="";
  await load();
  if(role!=="admin")throw Error("admin-required");
  page="admin";render();
 }catch(e){await signOut(auth);role="";throw e}
}
async function enterTeacher(code){
 const email=await groupEmail(subjectId,code);
 await signInWithEmailAndPassword(auth,email,code);
 try{
  await load();
  if(role!=="teacher")throw Error("group-disabled");
  page="students";render();
 }catch(e){await signOut(auth);role="";throw e}
}
async function exit(){
 await signOut(auth);role="";page="subjects";subjectId="";selected=null;group=null;students=[];groups=[];locks=[];grades={};render();
}
function nav(){
 const n=$("nav");n.hidden=!role;
 if(!role)return;
 n.innerHTML='<button id="goHome">⌂<span>الرئيسية</span></button><button id="goRefresh">⟳<span>تحديث</span></button><button id="goExit">↩<span>خروج</span></button>';
 $("goHome").onclick=()=>{page=role==="admin"?"admin":"students";render()};
 $("goRefresh").onclick=()=>task(async()=>{await load();render();flash("تم تحديث البيانات")});
 $("goExit").onclick=()=>task(exit);
}
function render(){renderVersion++;nav();const x=$("screen");if(!x)return;
 if(page==="subjects"){renderSubjects(x);return}
 if(page==="login"){renderLogin(x);return}
 if(page==="students"){renderStudents(x);return}
 if(page==="grades"){renderGrades(x);return}
 if(page==="admin"&&role==="admin"){renderAdmin(x);return}
 page="subjects";role="";render();
}
function renderSubjects(x){
 x.innerHTML=html("اختر المادة الدراسية","بوابة رصد الدرجات")+
 '<div class="grid" style="margin-top:16px">'+SUBJECTS.map((s,i)=>'<button class="item" data-sub="'+i+'"><strong>'+safe(s)+'</strong></button>').join("")+'</div>'+
 '<div style="margin-top:18px">'+btn("دخول منسق الموقع","adminLogin","outline full")+'</div>';
 x.querySelectorAll("[data-sub]").forEach(b=>b.onclick=()=>{subjectId=subId(Number(b.dataset.sub));page="login";render()});
 $("adminLogin").onclick=()=>{subjectId="";page="login";render()};
}
function renderLogin(x){
 const admin=!subjectId;
 x.innerHTML='<section class="panel">'+html(admin?"دخول منسق الموقع":subjectName(subjectId),"تسجيل الدخول الآمن")+
 (admin?'<p class="hint">أدخل البريد وكلمة المرور اللذين أنشأتهما بصفتك منسقًا في Firebase Authentication.</p><div class="field"><label for="email">البريد الإلكتروني</label><input type="email" id="email" autocomplete="username"></div>':'<p class="hint">أدخل رمز المجموعة الذي أصدره المنسق. لا يلزم اسم معلم أو بريده الشخصي.</p>')+
 '<div class="field"><label for="secret">'+(admin?"كلمة المرور":"رمز المجموعة")+'</label><input type="password" id="secret" maxlength="128" autocomplete="current-password"></div>'+
 '<div class="actions">'+btn("دخول","loginBtn")+btn("عودة","back","outline")+'</div></section>';
 $("back").onclick=()=>{page="subjects";render()};
 const login=()=>task(async()=>{
  const secret=admin?$("secret").value:$("secret").value.trim();
  if(!admin&&secret.length<6){flash("رمز المجموعة لا يقل عن 6 خانات");return}
  if(admin){const email=$("email").value.trim();if(!email){flash("أدخل البريد");return}await enterAdmin(email,secret)}
  else await enterTeacher(secret);
 });
 $("loginBtn").onclick=login;
 $("secret").onkeydown=e=>{if(e.key==="Enter")login()};
}
function renderStudents(x){
 if(role!=="teacher"){page="subjects";render();return}
 x.innerHTML='<div class="subject-label"><span>المادة الدراسية</span><b>'+safe(subjectName(subjectId))+'</b><small>الفصول المسندة: '+safe(labelsForClasses(group.classes||[]))+'</small></div>'+
 '<section class="panel">'+html("الطلاب المسندون",students.length+" طلاب")+'<div class="field"><label for="search">ابحث عن طالب</label><input id="search" placeholder="الاسم أو الفصل"></div><div id="list"></div></section>';
 const draw=()=>{
  const q=$("search").value.trim();
  $("list").innerHTML=students.filter(s=>(s.name+" "+className(s.classId)).includes(q)).map(s=>'<button class="student" data-student="'+safe(s.id)+'"><span class="avatar">ط</span><span class="meta"><strong>'+safe(s.name)+'</strong><small>الفصل '+safe(className(s.classId))+'</small></span><span>‹</span></button>').join("")||'<div class="empty">لا يوجد طلاب ضمن صلاحية هذه المجموعة</div>';
  $("list").querySelectorAll("[data-student]").forEach(b=>b.onclick=()=>{selected=students.find(s=>s.id===b.dataset.student);page="grades";render()});
 };
 $("search").oninput=draw;draw();
}
function renderGrades(x){
 if(!selected||role!=="teacher"||!students.some(s=>s.id===selected.id)){page="students";render();return}
 const v=renderVersion;
 x.innerHTML='<section class="panel"><div class="bar"><div><span class="eyebrow">'+safe(subjectName(subjectId))+' · '+safe(className(selected.classId))+'</span><h2 class="h">'+safe(selected.name)+'</h2></div>'+btn("الطلاب","backStudents","outline")+'</div>'+
 select("period","الفترة",periods,period)+select("test","التقييم",[...tests,["all","الكل"]],test)+
 '<div id="gradeFields"><p class="hint">جارٍ جلب الدرجات...</p></div><div class="notice">تُعرض الدرجتان منفصلتين، وتُحفظان في Firestore عند اعتماد كل درجة. التقييم المغلق لا يقبل التعديل.</div></section>';
 $("backStudents").onclick=()=>{page="students";render()};
 $("period").onchange=e=>{period=e.target.value;render()};
 $("test").onchange=e=>{test=e.target.value;render()};
 const chosen=test==="all"?tests.map(p=>p[0]):[test];
 const fetchRows=async()=>{
  try{
   const loaded=await Promise.all(chosen.map(t=>getDoc(gradeDoc(subjectId,selected.classId,selected.id,period,t))));
   if(renderVersion!==v)return;
   $("gradeFields").innerHTML=chosen.map((t,i)=>{
    const closed=locks.some(l=>l.id===lockId(subjectId,period,t)&&l.closed===true);
    const value=loaded[i].exists()?loaded[i].data().value:"";
    return '<div class="score"><div class="bar"><strong>'+safe(TESTS[Number(t.slice(1))])+'</strong><span class="pill '+(closed?"closed":"")+'">'+(closed?"مغلق":"مفتوح")+'</span></div>'+
    '<label class="hint" for="score'+i+'">الدرجة</label><input id="score'+i+'" type="number" min="0" step="any" value="'+safe(value)+'" '+(closed?"disabled":"")+' placeholder="لم تُرصد">'+
    '<button class="btn full" data-save="'+i+'" '+(closed?"disabled":"")+'>'+(value===""?"حفظ الدرجة":"تعديل الدرجة")+'</button></div>';
   }).join("");
   $("gradeFields").querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>task(async()=>{
    const t=chosen[Number(b.dataset.save)],v=$("score"+b.dataset.save).value;
    if(v.trim()===""||!Number.isFinite(Number(v))||Number(v)<0){flash("الدرجة يجب أن تكون رقمًا غير سالب");return}
    const payload={studentId:selected.id,subjectId,classId:selected.classId,periodId:period,testId:t,value:Number(v),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid};
    const batch=writeBatch(db);
    batch.set(gradeDoc(subjectId,selected.classId,selected.id,period,t),payload);
    batch.set(logDoc(),audit("saveGrade",{studentId:selected.id,subjectId,classId:selected.classId,periodId:period,testId:t}));
    await batch.commit();
    flash("تم حفظ الدرجة في قاعدة البيانات");
    render();
   }));
  }catch(e){if(renderVersion===v){$("gradeFields").innerHTML='<div class="notice">تعذّر تحميل الدرجات. '+safe(explain(e))+'</div>'}}
 };
 fetchRows();
}
function renderAdmin(x){
 const tabs=[["locks","الفترات والتقييمات"],["students","إدارة الطلاب"],["groups","رموز وإسناد الفصول"],["export","تصدير Excel"]];
 x.innerHTML=html("لوحة منسق الموقع","إدارة برنامج يسير")+'<div class="tabs" style="grid-template-columns:repeat(2,1fr);margin:16px 0">'+
 tabs.map(([id,t])=>'<button data-tab="'+id+'" class="'+(tab===id?"active":"")+'">'+safe(t)+'</button>').join("")+'</div><div id="adminArea"></div>';
 x.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render()});
 if(tab==="locks")renderLocks();else if(tab==="students")renderAdminStudents();else if(tab==="groups")renderGroups();else renderExport();
}
function renderLocks(){
 const x=$("adminArea");x.innerHTML='<section class="panel">'+html("فتح وإغلاق الرصد","المادة · الفترة · نوع التقييم")+
 select("lockSub","المادة",subs,"s0")+select("lockPer","الفترة",periods,"p0")+
 '<div id="lockRows"></div><div class="multi-actions">'+btn("فتح الفترة","openPeriod","secondary")+btn("إغلاق الفترة","closePeriod","danger")+btn("فتح جميع فترات المادة","openSub","secondary")+btn("إغلاق جميع فترات المادة","closeSub","danger")+btn("فتح جميع المواد","openAll","secondary")+btn("إغلاق جميع المواد","closeAll","danger")+'</div></section>';
 const sub=$("lockSub"),per=$("lockPer");
 const closed=(s,p,t)=>locks.some(l=>l.id===lockId(s,p,t)&&l.closed===true);
 const setLock=async(s,p,t,c)=>{
  await setDoc(lockDoc(s,p,t),{subjectId:s,periodId:p,testId:t,closed:c,updatedAt:serverTimestamp()});
 };
 const draw=()=>{
  $("lockRows").innerHTML=tests.map(([t,name],i)=>'<div class="manage-row"><div><b>'+safe(name)+'</b><small>'+(closed(sub.value,per.value,t)?"مغلق":"مفتوح")+'</small></div><button class="btn '+(closed(sub.value,per.value,t)?"secondary":"danger")+'" data-lock="'+i+'">'+(closed(sub.value,per.value,t)?"فتح":"إغلاق")+'</button></div>').join("");
  $("lockRows").querySelectorAll("[data-lock]").forEach(b=>b.onclick=()=>task(async()=>{const t="t"+b.dataset.lock;await setLock(sub.value,per.value,t,!closed(sub.value,per.value,t));await load();draw();flash("تم تحديث حالة التقييم")}));
 };
 sub.onchange=draw;per.onchange=draw;draw();
 const bulk=async(allSubjects,allPeriods,close)=>{
  if(!confirm((close?"إغلاق":"فتح")+" التقييمات المحددة؟"))return;
  await task(async()=>{
   const ss=allSubjects?subs.map(x=>x[0]):[sub.value],pp=allPeriods?periods.map(x=>x[0]):[per.value];
   const batch=writeBatch(db);
   for(const s of ss)for(const p of pp)for(const [t] of tests)batch.set(lockDoc(s,p,t),{subjectId:s,periodId:p,testId:t,closed:close,updatedAt:serverTimestamp()});
   await batch.commit();await load();draw();flash("تم تحديث "+ss.length*pp.length*2+" تقييمات");
  });
 };
 $("openPeriod").onclick=()=>bulk(false,false,false);$("closePeriod").onclick=()=>bulk(false,false,true);
 $("openSub").onclick=()=>bulk(false,true,false);$("closeSub").onclick=()=>bulk(false,true,true);
 $("openAll").onclick=()=>bulk(true,true,false);$("closeAll").onclick=()=>bulk(true,true,true);
}
function subjectBoxes(selectedSubjects=[]){return '<div class="switches">'+subs.map(([id,s])=>'<label><input type="checkbox" data-subject="'+id+'" '+(selectedSubjects.includes(id)?"checked":"")+'>'+safe(s)+'</label>').join("")+'</div>'}
function renderAdminStudents(){
 const x=$("adminArea");let editId=null;
 const draw=()=>{
  const active=students.filter(s=>!s.archived);
  x.innerHTML='<section class="panel">'+html(editId?"تعديل بيانات طالب":"إضافة طالب","الاسم الأول والأخير")+
  '<div class="field"><label for="studentName">اسم الطالب</label><input id="studentName" maxlength="90"></div>'+
  select("studentClass","الفصل",classrooms,"c1")+
  '<div class="field"><label>المواد المسندة</label>'+subjectBoxes()+'</div><div class="actions">'+btn(editId?"حفظ التعديل":"إضافة الطالب","saveStudent")+btn("إلغاء","clearStudent","outline")+'</div></section>'+
  '<section class="panel">'+html("الطلاب المسجلون",active.length+" طلاب")+
  active.map(s=>'<div class="manage-row"><div><b>'+safe(s.name)+'</b><small>الفصل '+safe(className(s.classId))+' · '+(s.subjects||[]).length+' مواد</small></div><div class="actions"><button class="btn outline" data-edit="'+safe(s.id)+'">تعديل</button><button class="btn danger" data-archive="'+safe(s.id)+'">أرشفة</button></div></div>').join("")+'</section>';
  $("clearStudent").onclick=()=>{editId=null;draw()};
  $("saveStudent").onclick=()=>task(async()=>{
   const name=$("studentName").value.trim().replace(/\s+/g," "),c=$("studentClass").value,subjects=[...x.querySelectorAll("[data-subject]:checked")].map(e=>e.dataset.subject);
   if(name.split(" ").length<2||!subjects.length){flash("أدخل الاسم الأول والأخير واختر مادة واحدة على الأقل");return}
   const old=editId?students.find(s=>s.id===editId):null;
   const target=editId?studentDoc(editId):doc(collection(db,"ys_students"));
   const after={name,classId:c,subjects,archived:false,updatedAt:serverTimestamp()};
   const beforeKeys=(old?.subjects||[]).map(s=>s+"|"+old.classId),afterKeys=subjects.map(s=>s+"|"+c);
   const batch=writeBatch(db);batch.set(target,after,{merge:true});
   for(const key of beforeKeys)if(!afterKeys.includes(key)){const [s,k]=key.split("|");batch.delete(enrollDoc(s,k,target.id))}
   for(const key of afterKeys){const [s,k]=key.split("|");batch.set(enrollDoc(s,k,target.id),{studentId:target.id,name,classId:k,subjectId:s})}
   batch.set(logDoc(),audit(old?"updateStudent":"createStudent",{studentId:target.id}));
   await batch.commit();await load();editId=null;draw();flash("تم حفظ الطالب وإسناد مواده");
  });
  x.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{editId=b.dataset.edit;const s=students.find(s=>s.id===editId);draw();$("studentName").value=s.name;$("studentClass").value=s.classId;x.querySelectorAll("[data-subject]").forEach(e=>e.checked=s.subjects.includes(e.dataset.subject))});
  x.querySelectorAll("[data-archive]").forEach(b=>b.onclick=()=>{if(!confirm("أرشفة الطالب وإيقاف ظهوره للمعلمين مع الاحتفاظ بسجل درجاته؟"))return;task(async()=>{
   const s=students.find(s=>s.id===b.dataset.archive);
   const batch=writeBatch(db);batch.update(studentDoc(s.id),{archived:true,updatedAt:serverTimestamp()});
   for(const sub of s.subjects||[])batch.delete(enrollDoc(sub,s.classId,s.id));
   batch.set(logDoc(),audit("archiveStudent",{studentId:s.id}));
   await batch.commit();await load();draw();flash("تمت الأرشفة");
  })});
 };draw();
}
function renderGroups(){
 const x=$("adminArea");let editId=null;
 const draw=()=>{
  x.innerHTML='<section class="panel">'+html(editId?"تعديل مجموعة الفصول":"إنشاء رمز مجموعة فصول","لا تُحفظ رموز الدخول في Firestore")+
  select("groupSubject","المادة",subs,"s0")+
  '<div class="field"><label for="groupLabel">اسم المجموعة (بدون أسماء معلمين)</label><input id="groupLabel" maxlength="80" placeholder="المجموعة أ"></div>'+
  (editId?'<p class="hint">رمز الدخول الحالي يبقى كما هو. لتغييره عطّل المجموعة وأنشئ رمزًا جديدًا.</p>':
  '<div class="field"><label for="groupPin">رمز المجموعة السري (6 خانات على الأقل)</label><input id="groupPin" type="password" maxlength="80" autocomplete="new-password" placeholder="يُعرض مرة واحدة بعد الإنشاء"></div>'+btn("توليد رمز قوي","genPin","outline"))+
  '<div class="field"><label>الفصول المسندة</label><div class="switches">'+classrooms.map(([c,n])=>'<label><input type="checkbox" data-class="'+c+'">'+safe(n)+'</label>').join("")+'</div></div>'+
  '<div class="actions">'+btn(editId?"حفظ تعديل المجموعة":"إنشاء المجموعة","saveGroup")+btn("إلغاء","cancelGroup","outline")+'</div></section>'+
  '<div id="generatedCode"></div><section class="panel">'+html("المجموعات المنشأة",groups.filter(g=>g.enabled).length+" فعالة")+
  groups.map(g=>'<div class="manage-row"><div><b>'+safe(subjectName(g.subjectId))+' – '+safe(g.label)+'</b><small>'+safe(labelsForClasses(g.classes||[]))+(g.enabled?"":" · معطلة")+'</small></div><div class="actions"><button class="btn outline" data-edit="'+safe(g.id)+'" '+(!g.enabled?"disabled":"")+'>تعديل</button><button class="btn danger" data-disable="'+safe(g.id)+'" '+(!g.enabled?"disabled":"")+'>تعطيل</button></div></div>').join("")+'</section>';
  if(!editId)$("genPin").onclick=()=>{$("groupPin").value=codeGenerate();$("groupPin").type="text"};
  $("cancelGroup").onclick=()=>{editId=null;draw()};
  $("saveGroup").onclick=()=>task(async()=>{
   const s=$("groupSubject").value,label=$("groupLabel").value.trim(),cls=[...x.querySelectorAll("[data-class]:checked")].map(n=>n.dataset.class);
   if(!label||!cls.length){flash("أدخل اسم المجموعة وحدد الفصول");return}
   if(groups.some(g=>g.id!==editId&&g.enabled&&g.subjectId===s&&g.classes.some(c=>cls.includes(c)))){flash("تداخل إسناد: هناك فصل ضمن مجموعة أخرى لهذه المادة");return}
   if(editId){
    await updateDoc(groupDoc(editId),{subjectId:s,label,classes:cls,updatedAt:serverTimestamp()});
    await load();editId=null;draw();flash("تم تعديل المجموعة وتحديث الصلاحيات");
   }else{
    const pin=$("groupPin").value.trim();
    if(pin.length<6){flash("رمز المجموعة لا يقل عن 6 خانات");return}
    if(!regAuth)throw Error("registrar-not-ready");
    const email=await groupEmail(s,pin);
    const cred=await createUserWithEmailAndPassword(regAuth,email,pin);
    try{
     await setDoc(groupDoc(cred.user.uid),{subjectId:s,label,classes:cls,enabled:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    }catch(e){try{await deleteUser(cred.user)}catch{}throw e}
    finally{await signOut(regAuth)}
    await load();draw();
    const box=$("generatedCode");
    box.innerHTML='<section class="panel"><h3 class="section-h">تم إنشاء المجموعة — انسخ الرمز الآن</h3><p class="hint">لن يظهر هذا الرمز مرة أخرى. احتفظ به بطريقة آمنة.</p><div class="manage-row"><code id="newPin" style="user-select:all;overflow-wrap:anywhere">'+safe(pin)+'</code>'+btn("نسخ الرمز","copyPin","secondary")+'</div></section>';
    $("copyPin").onclick=async()=>{try{await navigator.clipboard.writeText(pin);flash("تم نسخ الرمز")}catch{flash("حدد الرمز وانسخه يدويًا")}};
    flash("تم إنشاء المجموعة وربط رمز الدخول");
   }
  });
  x.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{editId=b.dataset.edit;const g=groups.find(g=>g.id===editId);draw();$("groupSubject").value=g.subjectId;$("groupLabel").value=g.label;x.querySelectorAll("[data-class]").forEach(i=>i.checked=g.classes.includes(i.dataset.class))});
  x.querySelectorAll("[data-disable]").forEach(b=>b.onclick=()=>{if(!confirm("تعطيل المجموعة وإلغاء صلاحيات رمزها فورًا؟"))return;task(async()=>{await updateDoc(groupDoc(b.dataset.disable),{enabled:false,updatedAt:serverTimestamp()});await load();draw();flash("تم تعطيل المجموعة")})});
 };draw();
}
const safeCsv=v=>{let s=String(v??"");if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
function renderExport(){
 const x=$("adminArea");x.innerHTML='<section class="panel">'+html("تصدير سجل الدرجات","Excel / CSV")+
 select("exportSub","المادة",[["","جميع المواد"],...subs],"")+
 select("exportPer","الفترة",[["","جميع الفترات"],...periods],"")+
 btn("تصدير بيانات الدرجات","download","full")+
 '<p class="hint">يصدر ملف CSV بترميز عربي UTF-8 قابل للفتح في Excel. يُسمح بالتصدير للمنسق فقط، ولا يحتوي على كلمة مرور.</p></section>';
 $("download").onclick=()=>task(async()=>{
  const ss=$("exportSub").value,pp=$("exportPer").value;
  const all=docArr(await getDocs(collection(db,"ys_grades"))).filter(r=>(!ss||ss===r.subjectId)&&(!pp||pp===r.periodId));
  if(!all.length){flash("لا توجد درجات مطابقة");return}
  const st=new Map(students.map(s=>[s.id,s]));
  const cells=[["الطالب","الفصل","المادة","الفترة","نوع التقييم","الدرجة"]];
  for(const r of all){const s=st.get(r.studentId);cells.push([s?.name||"مؤرشف",className(r.classId),subjectName(r.subjectId),PERIODS[Number(r.periodId.slice(1))],TESTS[Number(r.testId.slice(1))],r.value])}
  const csv="\ufeff"+cells.map(row=>row.map(safeCsv).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download="درجات_يسير_"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  flash("تم إنشاء ملف Excel متوافق بصيغة CSV");
 });
}
async function start(){
 try{
  const app=initializeApp(firebaseConfig);
  auth=getAuth(app);db=getFirestore(app);
  await setPersistence(auth,browserSessionPersistence);
  await auth.authStateReady();
  const reg=initializeApp(firebaseConfig,"ys-group-registrar");regAuth=getAuth(reg);
  await setPersistence(regAuth,inMemoryPersistence);
  if(auth.currentUser){try{await load();page=role==="admin"?"admin":"students"}catch{await signOut(auth)}}
  render();
 }catch(e){console.error("Firebase initialization failed",e?.code||e);$("screen").innerHTML='<section class="panel">'+html("تعذر بدء الاتصال","بوابة رصد الدرجات")+'<p class="hint">تأكد من تفعيل Firebase Authentication وCloud Firestore قبل الدخول.</p></section>'}
}
start();
