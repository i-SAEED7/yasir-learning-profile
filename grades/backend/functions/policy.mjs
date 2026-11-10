export function validScore(value){
  return typeof value==="number" && Number.isFinite(value) && value>=0;
}
export function canAccessStudent(user,student,subject){
  if (!student || student.archived || !Array.isArray(student.subjects) || !student.subjects.includes(subject)) return false;
  if(user?.role==="admin")return true;
  return user?.role==="teacher" && user.subject===subject && Array.isArray(user.classes) && user.classes.includes(student.class);
}
export function overlappingClasses(group,others){
  return others.some(other=>other.id!==group.id && other.enabled!==false && other.subject===group.subject &&
    Array.isArray(other.classes) && other.classes.some(c=>group.classes.includes(c)));
}
export function safeCsvCell(value){
  let text=String(value??"");
  if(/^[=+@\-\t\r]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
