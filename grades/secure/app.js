import {initializeApp} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {getAuth,setPersistence,inMemoryPersistence,signInWithCustomToken,signOut} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import {firebaseConfig,cloudRegion} from "./config.js";

const SUBJECTS=["الرياضيات","اللغة الإنجليزية","الأحياء","التربية الصحية والبدنية","التربية المهنية","التفكير الناقد","التقنية الرقمية","الحديث","الدراسات الاجتماعية","الفيزياء","القرآن الكريم والتفسير","الكفايات اللغوية","الكيمياء","المعرفة المالية","علم البيئة"];
const PERIODS=["فترة أولى","فترة ثانية","نهاية الفصل"];
const TESTS=["تقويمية تحريرية","المهام الأدائية والمشاركة والتفاعل"];
const CLASSES=Array.from({length:8},(_,i)=>"1/"+(i+1));
const $=id=>document.getElementById(id);
const safe=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
let auth=null,functions=null,role="",subject="",groupInfo=null,selectedStudent=null,period=PERIODS[0],test="الكل",page="subjects",tab="locks",portal={students:[],groups:[],locks:[],records:[]};
let busy=false;
const html=(title,sub="")=>'<div class="bar"><div><span class="eyebrow">'+safe(sub)+'</span><h2 class="h">'+safe(title)+'</h2></div></div>';
const button=(title,id,variant="")=>'<button class="btn '+variant+'" id="'+id+'">'+safe(title)+'</button>';
const option=v=>'<option>'+safe(v)+'</option>';
const field=(id,label,items,value)=>'<div class="field"><label for="'+id+'">'+safe(label)+'</label><select id="'+id+'">'+items.map(v=>'<option '+(v===value?'selected':'')+'>'+safe(v)+'</option>').join("")+'</select></div>';
const notice='هذه واجهة عمل تحتاج إلى تفعيل خدمات Firebase واعتماد ضوابط معالجة البيانات قبل استخدامها مع درجات حقيقية.';
function flash(message){const el=$("toast");el.textContent=message;el.hidden=false;clearTimeout(flash.timer);flash.timer=setTimeout(()=>el.hidden=true,4200)}
function err(e){const code=String(e?.code||"");if(code.includes("unauthenticated"))return "انتهت الجلسة أو رمز الدخول غير صحيح";if(code.includes("permission-denied"))return "ليس لديك صلاحية لهذه العملية أو أن الرصد مغلق";if(code.includes("resource-exhausted"))return "محاولات كثيرة. حاول لاحقًا";if(code.includes("unavailable")||code.includes("not-found"))return "الخدمة الخلفية غير مفعّلة أو غير متاحة حاليًا";return "تعذّرت العملية. لم تُحفظ البيانات، تحقق من اتصال الشبكة والخدمة"}
function call(name,payload={}){if(!functions)throw Error("not-ready");return httpsCallable(functions,name,{timeout:30000})(payload).then(r=>r.data)}
async function task(action){if(busy)return;busy=true;document.querySelectorAll("button").forEach(b=>b.disabled=true);try{await action()}catch(e){console.error("Portal operation failed",e?.code||"error");flash(err(e))}finally{busy=false;document.querySelectorAll("button").forEach(b=>b.disabled=false)}}
function reset(){role="";subject="";selectedStudent=null;groupInfo=null;page="subjects";portal={students:[],groups:[],locks:[],records:[]}}
function nav(){const n=$("nav");n.hidden=!role;if(!role)return;n.innerHTML='<button id="homeNav">⌂<div>الرئيسية</div></button><button id="refreshNav">⟳<div>تحديث</div></button><button id="exitNav">↩<div>خروج</div></button>';$("homeNav").onclick=()=>{page=role==="admin"?"admin":"students";render()};$("refreshNav").onclick=()=>task(async()=>{await refresh();render();flash("تم تحديث البيانات")});$("exitNav").onclick=()=>task(async()=>{try{await call("logoutPortal")}catch(e){console.warn("Server logout failed",e?.code)}await signOut(auth);reset();render()})}
async function refresh(){const data=await call("loadPortal");role=data.role;portal={students:data.students||[],groups:data.groups||[],locks:data.locks||[],records:data.records||[]};groupInfo=data.groupInfo||groupInfo}
const gradeFor=(id,p,t)=>portal.records.find(r=>r.studentId===id&&r.subject===subject&&r.period===p&&r.test===t);
const lockFor=(s,p,t)=>portal.locks.some(v=>v.subject===s&&v.period===p&&v.test===t&&v.closed===true);
const scopedStudents=()=>portal.students.filter(s=>!s.archived&&s.subjects?.includes(subject)&&(!groupInfo||groupInfo.classes.includes(s.class))).sort((a,b)=>a.class.localeCompare(b.class,"en")||a.name.localeCompare(b.name,"ar"));
function render(){nav();const x=$("screen");if(!x)return;
if(page==="subjects"){
 x.innerHTML=html("اختر المادة الدراسية","نظام الرصد")+'<div class="notice">'+safe(notice)+'</div><div class="grid" style="margin-top:15px">'+SUBJECTS.map((s,i)=>'<button class="item" data-sub="'+i+'"><strong>'+safe(s)+'</strong></button>').join("")+'</div><div style="margin-top:16px">'+button("دخول منسق الموقع","adminEntry","outline full")+'</div>';
 x.querySelectorAll("[data-sub]").forEach(b=>b.onclick=()=>{subject=SUBJECTS[Number(b.dataset.sub)];page="login";render()});$("adminEntry").onclick=()=>{subject="";page="login";render()};return;
}
if(page==="login"){
 x.innerHTML='<section class="panel">'+html(subject||"دخول منسق الموقع","رمز الدخول")+'<p class="hint">أدخل رمز مجموعتك المسندة أو رمز المنسق. لا توجد رموز افتراضية أو تجريبية هنا.</p><div class="field"><label for="secret">رمز الدخول</label><input id="secret" type="password" maxlength="128" autocomplete="off"></div><div class="actions">'+button("تسجيل الدخول","loginBtn")+button("عودة","back","outline")+'</div></section>';
 $("back").onclick=()=>{page="subjects";render()};$("loginBtn").onclick=()=>task(async()=>{const pin=$("secret").value;if(pin.length<8){flash("أدخل رمزًا صالحًا");return}const res=await call("loginWithPin",{admin:!subject,subject,pin});await signInWithCustomToken(auth,res.token);role=res.role;await refresh();page=role==="admin"?"admin":"students";render()});return;
}
if(page==="students"){
 const students=scopedStudents();
 x.innerHTML='<div class="subject-label"><span>المادة الدراسية</span><b>'+safe(subject)+'</b><small>الفصول المسندة: '+safe(groupInfo?.classes?.join("، ")||"")+'</small></div><section class="panel">'+html("الطلاب المسندون",students.length+" طلاب")+ '<div class="field"><label for="query">ابحث عن طالب</label><input id="query" autocomplete="off" placeholder="الاسم أو الفصل"></div><div id="studentRows"></div></section>';
 const draw=()=>{const q=$("query").value.trim();$("studentRows").innerHTML=students.filter(s=>(s.name+" "+s.class).includes(q)).map(s=>'<button class="student" data-id="'+safe(s.id)+'"><span class="avatar">ط</span><span class="meta"><strong>'+safe(s.name)+'</strong><small>الفصل '+safe(s.class)+'</small></span><span>‹</span></button>').join("")||'<div class="empty">لا يوجد طلاب ضمن الفصول المسندة</div>';$("studentRows").querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{selectedStudent=students.find(s=>s.id===b.dataset.id);page="grades";render()})};$("query").oninput=draw;draw();return;
}
if(page==="grades"){
 if(!selectedStudent||!scopedStudents().some(s=>s.id===selectedStudent.id)){page="students";render();return}
 const student=selectedStudent,selected=test==="الكل"?TESTS:[test];
 x.innerHTML='<section class="panel"><div class="bar"><div><span class="eyebrow">المادة: '+safe(subject)+' · الفصل '+safe(student.class)+'</span><h2 class="h">'+safe(student.name)+'</h2></div>'+button("الطلاب","backStudents","outline")+'</div>'+field("period","الفترة",PERIODS,period)+field("test","الاختبار",[...TESTS,"الكل"],test)+'<div id="gradesFields"></div><div class="notice">خيار «الكل» يعرض درجات التقييمات منفصلة دون احتساب مجموع. لا توجد درجة عظمى محددة.</div></section>';
 $("backStudents").onclick=()=>{page="students";render()};$("period").onchange=e=>{period=e.target.value;render()};$("test").onchange=e=>{test=e.target.value;render()};
 $("gradesFields").innerHTML=selected.map((t,i)=>{const record=gradeFor(student.id,period,t),closed=lockFor(subject,period,t);return '<div class="score"><div class="bar"><strong>'+safe(t)+'</strong><span class="pill '+(closed?"closed":"")+'">'+(closed?"مغلق":"مفتوح")+'</span></div><label class="hint" for="grade'+i+'">الدرجة</label><input type="number" id="grade'+i+'" min="0" step="any" '+(closed?"disabled":"")+' value="'+(record?.value??"")+'"><button data-save="'+i+'" class="btn full" '+(closed?"disabled":"")+'>'+ (record?"تعديل الدرجة":"حفظ الدرجة") +'</button></div>'}).join("");
 $("gradesFields").querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>task(async()=>{const i=Number(b.dataset.save),v=$("grade"+i).value;if(v===""||!Number.isFinite(Number(v))||Number(v)<0){flash("أدخل درجة رقمية غير سالبة");return}await call("saveGrade",{studentId:student.id,subject,period,test:selected[i],value:Number(v)});await refresh();render();flash("تم حفظ الدرجة في قاعدة البيانات") }));return;
}
if(page==="admin"){if(role!=="admin"){reset();render();return}
 const tabs=[["locks","التحكم بالفترات"],["students","إدارة الطلاب"],["groups","إسناد الفصول"],["export","تصدير Excel"]];
 x.innerHTML=html("لوحة منسق الموقع","الإدارة والتحكم")+'<div class="tabs" style="grid-template-columns:repeat(2,1fr);margin:14px 0">'+tabs.map(([id,t])=>'<button data-tab="'+id+'" class="'+(tab===id?"active":"")+'">'+t+'</button>').join("")+'</div><div id="adminArea"></div>';
 x.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render()});
 if(tab==="locks")renderLocks();
 else if(tab==="students")renderStudents();
 else if(tab==="groups")renderGroups();
 else renderExport();
 return;
}}
function renderLocks(){const a=$("adminArea");a.innerHTML='<section class="panel">'+html("إدارة فترات الرصد","حسب المادة والفترة والاختبار")+field("lockSubject","المادة",SUBJECTS,SUBJECTS[0])+field("lockPeriod","الفترة",PERIODS,PERIODS[0])+'<div id="currentLocks"></div><div class="multi-actions">'+button("فتح الفترة","openPeriod","secondary")+button("إغلاق الفترة","closePeriod","danger")+button("فتح كل فترات المادة","openSubject","secondary")+button("إغلاق كل فترات المادة","closeSubject","danger")+button("فتح جميع المواد","openAll","secondary")+button("إغلاق جميع المواد","closeAll","danger")+'</div></section>';
 const sub=$("lockSubject"),per=$("lockPeriod");
 const draw=()=>{const s=sub.value,p=per.value;$("currentLocks").innerHTML=TESTS.map((t,i)=>'<div class="manage-row"><div><strong>'+safe(t)+'</strong><small>'+(lockFor(s,p,t)?"مغلق":"مفتوح")+'</small></div><button class="btn '+(lockFor(s,p,t)?"secondary":"danger")+'" data-toggle="'+i+'">'+(lockFor(s,p,t)?"فتح":"إغلاق")+'</button></div>').join("");$("currentLocks").querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>task(async()=>{const t=TESTS[Number(b.dataset.toggle)];await call("setLocks",{subject:s,period:p,test:t,closed:!lockFor(s,p,t)});await refresh();draw();flash("تم تحديث حالة التقييم") }))};
 sub.onchange=draw;per.onchange=draw;draw();
 async function change(mode,closed){if(!confirm("تأكيد "+(closed?"إغلاق":"فتح")+" "+mode+"؟"))return;await task(async()=>{await call("setLocks",{subject:sub.value,period:per.value,test:TESTS[0],closed,allSubjects:mode==="جميع المواد",allPeriods:mode!=="الفترة",allTests:true});await refresh();draw();flash("تم تحديث حالات الرصد")})}
 $("openPeriod").onclick=()=>change("الفترة",false);$("closePeriod").onclick=()=>change("الفترة",true);$("openSubject").onclick=()=>change("المادة",false);$("closeSubject").onclick=()=>change("المادة",true);$("openAll").onclick=()=>change("جميع المواد",false);$("closeAll").onclick=()=>change("جميع المواد",true);
}
function subjectCheckboxes(chosen=[]){return '<div class="switches">'+SUBJECTS.map((s,i)=>'<label><input type="checkbox" data-s="'+i+'" '+(chosen.includes(s)?"checked":"")+'>'+safe(s)+'</label>').join("")+'</div>'}
function renderStudents(){const a=$("adminArea");let editId=null;
 const draw=()=>{a.innerHTML='<section class="panel">'+html(editId?"تعديل الطالب":"إضافة طالب","الاسم الأول والأخير فقط")+'<div class="field"><label for="studentName">اسم الطالب</label><input id="studentName" maxlength="90"></div>'+field("studentClass","الفصل",CLASSES,CLASSES[0])+'<div class="field"><label>المواد المسندة</label>'+subjectCheckboxes()+'</div><div class="actions">'+button(editId?"حفظ التعديل":"إضافة الطالب","saveStudent")+button("إلغاء","cancel","outline")+'</div></section><section class="panel">'+html("الطلاب المسجلون",portal.students.length+" طلاب")+portal.students.map(s=>'<div class="manage-row"><div><b>'+safe(s.name)+'</b><small>الفصل '+safe(s.class)+'</small></div><div class="actions"><button class="btn outline" data-edit="'+safe(s.id)+'">تعديل</button><button class="btn danger" data-archive="'+safe(s.id)+'">أرشفة</button></div></div>').join("")+'</section>';
 $("cancel").onclick=()=>{editId=null;draw()};
 $("saveStudent").onclick=()=>task(async()=>{const name=$("studentName").value.trim(),cls=$("studentClass").value,subjects=[...a.querySelectorAll("[data-s]:checked")].map(e=>SUBJECTS[Number(e.dataset.s)]);if(name.split(/\s+/).length<2||!subjects.length){flash("أدخل الاسم الأول والأخير واختر مادة");return}await call("upsertStudent",{...(editId?{id:editId}:{}),name,class:cls,subjects});await refresh();editId=null;draw();flash("تم حفظ بيانات الطالب")});
 a.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{editId=b.dataset.edit;draw();const st=portal.students.find(s=>s.id===editId);$("studentName").value=st.name;$("studentClass").value=st.class;a.querySelectorAll("[data-s]").forEach(ch=>ch.checked=st.subjects.includes(SUBJECTS[Number(ch.dataset.s)]))});
 a.querySelectorAll("[data-archive]").forEach(b=>b.onclick=()=>{if(!confirm("أرشفة الطالب دون حذف درجاته السابقة؟"))return;task(async()=>{await call("removeStudent",{id:b.dataset.archive});await refresh();draw();flash("تمت أرشفة الطالب")})});
 };draw();
}
function renderGroups(){const a=$("adminArea");let editId=null;
 const draw=()=>{a.innerHTML='<section class="panel">'+html(editId?"تعديل مجموعة":"إنشاء مجموعة فصول","رمز مستقل لكل مجموعة") +field("groupSubject","المادة",SUBJECTS,SUBJECTS[0])+'<div class="field"><label for="groupLabel">اسم المجموعة</label><input id="groupLabel" maxlength="80" placeholder="المجموعة أ"></div><div class="field"><label for="groupPin">رمز الدخول</label><input type="password" id="groupPin" autocomplete="off" placeholder="'+(editId?"اتركه فارغًا للاحتفاظ بالرمز":"12 حرفًا على الأقل")+'"></div><div class="field"><label>الفصول المسموحة</label><div class="switches">'+CLASSES.map(c=>'<label><input type="checkbox" data-class="'+c+'">'+c+'</label>').join("")+'</div></div><div class="actions">'+button(editId?"حفظ المجموعة":"إنشاء المجموعة","saveGroup")+button("إلغاء","cancelGroup","outline")+'</div></section><section class="panel">'+html("مجموعات الفصول",portal.groups.length+" مجموعات")+portal.groups.map(g=>'<div class="manage-row"><div><b>'+safe(g.subject)+" – "+safe(g.label)+'</b><small>'+safe(g.classes?.join("، "))+'</small></div><div class="actions"><button class="btn outline" data-edit-g="'+safe(g.id)+'">تعديل</button><button class="btn danger" data-del-g="'+safe(g.id)+'">تعطيل</button></div></div>').join("")+'</section>';
 $("cancelGroup").onclick=()=>{editId=null;draw()};
 $("saveGroup").onclick=()=>task(async()=>{const group={subject:$("groupSubject").value,label:$("groupLabel").value.trim(),classes:[...a.querySelectorAll("[data-class]:checked")].map(e=>e.dataset.class)},pin=$("groupPin").value;if(editId)group.id=editId;if(pin)group.pin=pin;if(!group.label||!group.classes.length||(!editId&&pin.length<12)||(pin&&pin.length<12)){flash("أدخل اسم المجموعة وفصولها ورمزًا قويًا عند إنشاء المجموعة");return}await call("upsertGroup",group);await refresh();editId=null;draw();flash("تم تحديث المجموعة، ويجب على من تغيّرت صلاحياته تسجيل الدخول مجددًا")});
 a.querySelectorAll("[data-edit-g]").forEach(b=>b.onclick=()=>{editId=b.dataset.editG;draw();const g=portal.groups.find(g=>g.id===editId);$("groupSubject").value=g.subject;$("groupLabel").value=g.label;a.querySelectorAll("[data-class]").forEach(ch=>ch.checked=g.classes?.includes(ch.dataset.class))});
 a.querySelectorAll("[data-del-g]").forEach(b=>b.onclick=()=>{if(!confirm("تعطيل المجموعة وإيقاف صلاحياتها؟"))return;task(async()=>{await call("disableGroup",{id:b.dataset.delG});await refresh();draw();flash("تم تعطيل المجموعة")})});
 };draw();
}
function renderExport(){const a=$("adminArea");a.innerHTML='<section class="panel">'+html("تصدير الدرجات","ملف Excel شامل مع فلاتر")+'<div class="field"><label for="exportSubject">المادة</label><select id="exportSubject"><option value="">جميع المواد</option>'+SUBJECTS.map(option).join("")+'</select></div><div class="field"><label for="exportPeriod">الفترة</label><select id="exportPeriod"><option value="">جميع الفترات</option>'+PERIODS.map(option).join("")+'</select></div>'+button("تصدير Excel","download","full")+'<p class="hint">التصدير متاح للمنسق فقط، ويؤخذ من بيانات الخادم.</p></section>';
 $("download").onclick=()=>task(async()=>{
  const rows=await call("exportGrades"),sub=$("exportSubject").value,p=$("exportPeriod").value;
  const students=new Map(portal.students.map(s=>[s.id,s]));
  const data=rows.filter(r=>(!sub||r.subject===sub)&&(!p||r.period===p)).map(r=>{const student=students.get(r.studentId);return {"الطالب":student?.name||"مؤرشف","الفصل":student?.class||"","المادة":r.subject,"الفترة":r.period,"الاختبار":r.test,"الدرجة":r.value}});
  if(!data.length){flash("لا توجد درجات مطابقة");return}
  if(!window.XLSX){await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";script.onload=resolve;script.onerror=reject;document.head.appendChild(script)})}
  const book=window.XLSX.utils.book_new(),sheet=window.XLSX.utils.json_to_sheet(data),range=window.XLSX.utils.decode_range(sheet["!ref"]);sheet["!autofilter"]={ref:sheet["!ref"]};sheet["!cols"]=[{wch:28},{wch:12},{wch:30},{wch:18},{wch:40},{wch:13}];window.XLSX.utils.book_append_sheet(book,sheet,"درجات يسير");window.XLSX.writeFile(book,"درجات_يسير.xlsx");flash("تم إنشاء ملف Excel");
 });
}
async function bootstrap(){try{const app=initializeApp(firebaseConfig);auth=getAuth(app);await setPersistence(auth,inMemoryPersistence);functions=getFunctions(app,cloudRegion);reset();render()}catch(e){$("screen").innerHTML='<section class="panel"><h2 class="h">تعذّر تهيئة خدمة الرصد</h2><p class="hint">يرجى التحقق من إعداد Firebase والتفويض قبل تشغيل الموقع.</p></section>';console.error("Firebase initialization failed",e?.code||"error")}}
bootstrap();
