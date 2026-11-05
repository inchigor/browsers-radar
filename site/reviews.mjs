export const REVIEW_STATUSES = ["primary", "secondary", "testing", "checked", "watch", "rejected", "new", "unreviewed"];
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function parseReviews(text) {
  let data;
  try { data=JSON.parse(text); } catch { throw new Error("Не удалось прочитать JSON. Проверь файл и попробуй снова."); }
  if(!isObject(data))throw new Error("Файл должен содержать объект с оценками.");
  for(const [id,review] of Object.entries(data)){
    if(!id.trim() || ["__proto__", "prototype", "constructor"].includes(id) || !isObject(review))throw new Error("Некорректная запись оценки.");
    if(!REVIEW_STATUSES.includes(review.status))throw new Error(`Недопустимый статус в оценке «${id}».`);
    if((has(review,"note") && typeof review.note!=="string") || (has(review,"reviewedAt") && typeof review.reviewedAt!=="string"))throw new Error(`Некорректные данные оценки «${id}».`);
  }
  return data;
}

function equal(a,b){
  if(a===b)return true;
  if(!a || !b || typeof a!=="object" || typeof b!=="object" || Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length && keys.every(key=>has(b,key) && equal(a[key],b[key]));
}

export function compareReviews(current, imported){
  const counts={new:0,identical:0,conflicts:0};
  for(const [id,review] of Object.entries(imported)){
    if(!has(current,id))counts.new++;
    else if(equal(current[id],review))counts.identical++;
    else counts.conflicts++;
  }
  return counts;
}

export function mergeReviews(current, imported, conflictPolicy){
  if(!["keep","replace"].includes(conflictPolicy))throw new Error("Не выбран способ разрешения конфликтов.");
  const merged={...current};
  for(const [id,review] of Object.entries(imported)){
    if(!has(current,id) || conflictPolicy==="replace")Object.defineProperty(merged,id,{value:review,enumerable:true,writable:true,configurable:true});
  }
  return merged;
}

export function storeImportedReviews(storage, key, snapshot, current, imported, conflictPolicy){
  if(storage.getItem(key)!==snapshot)throw new Error("Оценки изменились в другой вкладке. Обнови страницу и выбери файл снова.");
  const merged=mergeReviews(current,imported,conflictPolicy);
  storage.setItem(key,JSON.stringify(merged));
  return merged;
}
