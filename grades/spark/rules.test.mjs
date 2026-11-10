import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,serverTimestamp} from "firebase/firestore";
let env;
const grade=(id,s,c,st,p,t)=>doc(env.authenticatedContext(id).firestore(),"ys_grades",[s,c,st,p,t].join("_"));
before(async()=>{
 env=await initializeTestEnvironment({
  projectId:"demo-yasir-rules-tests",
  firestore:{rules:readFileSync(new URL("./firestore.rules",import.meta.url),"utf8"),host:"127.0.0.1",port:8080}
 });
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,"ys_admins","admin1"),{active:true});
  await setDoc(doc(db,"ys_groups","teach1"),{enabled:true,subjectId:"s0",label:"أ",classes:["c1"]});
  await setDoc(doc(db,"ys_enrollments","s0","classes","c1","members","st1"),{studentId:"st1",subjectId:"s0",classId:"c1",name:"طالب تجريبي"});
  await setDoc(doc(db,"ys_enrollments","s0","classes","c2","members","st2"),{studentId:"st2",subjectId:"s0",classId:"c2",name:"طالب آخر"});
 });
});
after(async()=>{await env?.cleanup()});
test("Teacher cannot list a different classroom or subject",async()=>{
 const db=env.authenticatedContext("teach1").firestore();
 await assertSucceeds(getDocs(collection(db,"ys_enrollments","s0","classes","c1","members")));
 await assertFails(getDocs(collection(db,"ys_enrollments","s0","classes","c2","members")));
 await assertFails(getDocs(collection(db,"ys_enrollments","s1","classes","c1","members")));
});
test("Teacher can get a missing grade, write a valid grade but cannot write outside group",async()=>{
 const db=env.authenticatedContext("teach1").firestore();
 const ok=doc(db,"ys_grades","s0_c1_st1_p0_t0");
 await assertSucceeds(getDoc(ok));
 await assertSucceeds(setDoc(ok,{subjectId:"s0",classId:"c1",studentId:"st1",periodId:"p0",testId:"t0",value:12,updatedAt:serverTimestamp(),updatedBy:"teach1"}));
 await assertFails(setDoc(doc(db,"ys_grades","s0_c2_st2_p0_t0"),{subjectId:"s0",classId:"c2",studentId:"st2",periodId:"p0",testId:"t0",value:12,updatedAt:serverTimestamp(),updatedBy:"teach1"}));
 await assertFails(setDoc(doc(db,"ys_grades","s0_c1_st1_p0_t1"),{subjectId:"s0",classId:"c1",studentId:"st1",periodId:"p0",testId:"t1",value:-1,updatedAt:serverTimestamp(),updatedBy:"teach1"}));
});
test("Anonymous users cannot read students or grades",async()=>{
 const db=env.unauthenticatedContext().firestore();
 await assertFails(getDocs(collection(db,"ys_students")));
 await assertFails(getDoc(doc(db,"ys_grades","s0_c1_st1_p0_t0")));
});
test("Admin can close a period and teacher cannot change its grades after close",async()=>{
 const a=env.authenticatedContext("admin1").firestore();
 await assertSucceeds(setDoc(doc(a,"ys_locks","s0_p0_t0"),{subjectId:"s0",periodId:"p0",testId:"t0",closed:true,updatedAt:serverTimestamp()}));
 const t=env.authenticatedContext("teach1").firestore();
 await assertFails(updateDoc(doc(t,"ys_grades","s0_c1_st1_p0_t0"),{value:14,updatedAt:serverTimestamp()}));
 await assertSucceeds(getDocs(collection(a,"ys_grades")));
});
