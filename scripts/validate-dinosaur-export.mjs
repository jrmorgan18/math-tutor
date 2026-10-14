// Dependency-free validation of the JSON Schema subset used by this v1 contract.
// Semantic model/result consistency is additionally checked by src/play/dnaLab.ts.
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const schema = JSON.parse(await readFile(new URL('../docs/dinosaur-export.schema.json', import.meta.url), 'utf8'));
export function validateContractShape(value) {
  const errors = [];
  function check(v, s, path) {
    if ('const' in s && v !== s.const) errors.push(path + ': unsupported constant/version');
    if (s.enum && !s.enum.includes(v)) errors.push(path + ': value outside allowed choices');
    const object = v !== null && typeof v === 'object' && !Array.isArray(v);
    const typeOK = !s.type || ({ object, array:Array.isArray(v), string:typeof v === 'string', number:typeof v === 'number' && Number.isFinite(v), integer:Number.isInteger(v) })[s.type];
    if (!typeOK) { errors.push(path + ': expected ' + s.type); return; }
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum || s.maximum !== undefined && v > s.maximum || s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) errors.push(path + ': out of bounds');
    }
    if (typeof v === 'string') {
      const length = [...v].length;
      if (s.minLength !== undefined && length < s.minLength || s.maxLength !== undefined && length > s.maxLength || s.pattern && !new RegExp(s.pattern).test(v)) errors.push(path + ': invalid string');
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems || s.maxItems !== undefined && v.length > s.maxItems) errors.push(path + ': invalid collection length');
      if (s.items) v.forEach((item,i) => check(item,s.items,path + '[' + i + ']'));
    }
    if (object) {
      for (const key of s.required ?? []) if (!Object.hasOwn(v,key)) errors.push(path + '.' + key + ': missing');
      for (const [key,item] of Object.entries(v)) {
        if (s.properties?.[key]) check(item,s.properties[key],path + '.' + key);
        else if (s.additionalProperties === false) errors.push(path + '.' + key + ': unknown field');
      }
    }
  }
  check(value,schema,'export'); return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('Usage: node scripts/validate-dinosaur-export.mjs dinosaur.json');
    if ((await stat(file)).size > 100_000) throw new Error('Export exceeds the 100 KB import limit.');
    const errors = validateContractShape(JSON.parse(await readFile(file,'utf8')));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Valid Genesis Lab v1 export shape. Check model/result consistency with validateExport before importing.');
  } catch(e) { console.error(e.message); process.exitCode = 1; }
}
