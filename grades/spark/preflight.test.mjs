import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("./",import.meta.url);
const js=readFileSync(new URL("app.js",root),"utf8");
const rules=readFileSync(new URL("firestore.rules",root),"utf8");
const config=JSON.parse(readFileSync(new URL("firebase.json",root),"utf8"));
const html=readFileSync(new URL("index.html",root),"utf8");

test("Free plan does not require callable Cloud Functions",()=>{
 assert.ok(!js.includes("firebase-functions.js"));
 assert.ok(!js.includes("httpsCallable"));
 assert.ok(!JSON.stringify(config).includes("functions"));
});
test("Only Firebase Authentication and Firestore store the grade data",()=>{
 assert.match(js,/signInWithEmailAndPassword/);
 assert.match(js,/getFirestore/);
 assert.match(js,/writeBatch/);
 assert.ok(!js.includes("localStorage"));
 assert.ok(!js.includes("admin-demo"));
});
test("Rules apply scoped enrolment paths and deny unknown collections",()=>{
 for(const item of ["ys_admins","ys_groups","ys_students","ys_enrollments","ys_locks","ys_grades","scope(subjectId, classId)","gradeFields","match /{document=**}"]){
  assert.ok(rules.includes(item),item);
 }
 assert.ok(!rules.includes("allow read, write: if true"));
 assert.match(rules,/allow list: if isAdmin\(\);/);
 assert.match(rules,/request\.resource\.data\.value|d\.value >= 0/);
});
test("App has RTL and remains visibly unofficial",()=>{
 assert.ok(html.includes('dir="rtl"'));
 assert.ok(html.includes("غير رسمية"));
 assert.ok(html.includes("./app.js"));
});
