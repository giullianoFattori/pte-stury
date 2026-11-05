import type { WriteEssayItemData } from '../../pte/taskData.ts';
import { calculateEssayRequirementCoverage } from './content.ts';
import { essaySentenceCount, validateEssayForm } from './form.ts';
import { analyseEssayMechanics, analyseEssayStructure } from './structure.ts';
import type { WriteEssayAnalysis } from './types.ts';

export function analyseWriteEssay(response:string,data:Pick<WriteEssayItemData,'keyRequirements'>):WriteEssayAnalysis {
 const form=validateEssayForm(response),sentenceCount=essaySentenceCount(response);
 return Object.freeze({form,requirements:calculateEssayRequirementCoverage(response,data),structure:analyseEssayStructure(response),mechanics:analyseEssayMechanics(response,sentenceCount)});
}
