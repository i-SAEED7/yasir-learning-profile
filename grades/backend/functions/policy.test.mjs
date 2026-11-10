import test from "node:test";
import assert from "node:assert/strict";
import {validScore,canAccessStudent,overlappingClasses,safeCsvCell} from "./policy.mjs";

test("Grade values without a maximum",()=>{
 assert.equal(validScore(0),true);
 assert.equal(validScore(1000.25),true);
 for(const v of [-1,NaN,Infinity,"100",null,undefined]) assert.equal(validScore(v),false);
});
test("Access limited to a teacher's subject and classes",()=>{
 const teacher={role:"teacher",subject:"الرياضيات",classes:["1/1","1/2"]};
 const student={class:"1/1",subjects:["الرياضيات"]};
 assert.equal(canAccessStudent(teacher,student,"الرياضيات"),true);
 assert.equal(canAccessStudent(teacher,{...student,class:"1/3"},"الرياضيات"),false);
 assert.equal(canAccessStudent(teacher,student,"الأحياء"),false);
 assert.equal(canAccessStudent(teacher,{...student,archived:true},"الرياضيات"),false);
 assert.equal(canAccessStudent({role:"admin"},student,"الرياضيات"),true);
});
test("Group assignments cannot overlap in the same subject",()=>{
 const groups=[{id:"a",subject:"الرياضيات",enabled:true,classes:["1/1","1/2"]}];
 assert.equal(overlappingClasses({id:"b",subject:"الرياضيات",classes:["1/2","1/3"]},groups),true);
 assert.equal(overlappingClasses({id:"b",subject:"الأحياء",classes:["1/2"]},groups),false);
 assert.equal(overlappingClasses({id:"a",subject:"الرياضيات",classes:["1/1"]},groups),false);
});
test("CSV export neutralizes formula injection",()=>{
 assert.equal(safeCsvCell("=1+1"),'"\'=1+1"');
 assert.equal(safeCsvCell("+SUM(A1)"),'"\'+SUM(A1)"');
 assert.equal(safeCsvCell("أحمد"),'"أحمد"');
 assert.equal(safeCsvCell('س"م'),'"س""م"');
});
