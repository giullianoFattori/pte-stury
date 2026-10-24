import type{Attempt,AttemptResponseData}from'./types.ts';
const RESPONSE_KEYS=['selectedTokenIds','correctTokenIds','falsePositiveTokenIds','missedTokenIds']as const;
function ids(value:unknown):value is readonly string[]{return Array.isArray(value)&&value.length<=2000&&value.every(id=>typeof id==='string'&&id.length>0&&id.length<=64)&&new Set(value).size===value.length;}
export function validateAttemptResponseData(attempt:Attempt):void{
 const value=attempt.responseData;
 if(attempt.taskType!=='highlight-incorrect-words'){if(value!==undefined)throw new TypeError('Structured token-selection responses are only valid for Highlight Incorrect Words.');return;}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(key=>!RESPONSE_KEYS.includes(key as typeof RESPONSE_KEYS[number])))throw new TypeError('HIW response data must be a plain, recognized JSON object.');
 const data=value as AttemptResponseData;
 if(!RESPONSE_KEYS.every(key=>Object.hasOwn(data,key)&&ids(data[key])))throw new TypeError('HIW response token IDs must be present, unique and bounded.');
 const selected=new Set(data.selectedTokenIds),correct=new Set(data.correctTokenIds),falsePositive=new Set(data.falsePositiveTokenIds),missed=new Set(data.missedTokenIds);
 if([...correct].some(id=>!selected.has(id))||[...falsePositive].some(id=>!selected.has(id)||correct.has(id))||selected.size!==correct.size+falsePositive.size||[...missed].some(id=>selected.has(id)))throw new TypeError('HIW selected, correct, false-positive and missed token sets are inconsistent.');
}
