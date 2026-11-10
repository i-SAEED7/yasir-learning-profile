import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("./",import.meta.url);
const html=readFileSync(new URL("index.html",root),"utf8");
const app=readFileSync(new URL("app.js",root),"utf8");
test("Production candidate does not expose demo PINs",()=>{
 assert.ok(!html.includes("admin-demo"));
 assert.ok(!html.includes("demo1111"));
 assert.ok(!app.includes("admin-demo"));
 assert.ok(!app.includes("const SAMPLE"));
});
test("Production candidate uses authenticated server API for grade changes",()=>{
 assert.match(app,/signInWithCustomToken/);
 assert.match(app,/call\("saveGrade"/);
 assert.match(app,/call\("setLocks"/);
 assert.match(app,/call\("loadPortal"/);
 assert.match(app,/call\("upsertGroup"/);
});
test("Production candidate is kept out of search indexes until approval",()=>{
 assert.match(html,/noindex, nofollow/);
});
test("Sensitive students are not persisted in localStorage",()=>{
 assert.ok(!app.includes("localStorage"));
 assert.match(app,/inMemoryPersistence/);
});
