import { database, snapshot, now, history } from './content-db.mjs';
import { bootstrapApp } from '../../src/app/bootstrap.ts';
import { createStudySessionsRepository } from '../../src/data/repositories/studySessionsRepository.ts';
import { createStudyOutcomeRepository } from '../../src/data/repositories/studyOutcomeRepository.ts';
import { createStudyItemsRepository } from '../../src/data/repositories/studyItemsRepository.ts';
import { startStudySession } from '../../src/application/study-session/startStudySession.ts';
export { snapshot, now, history };
export async function setup(t) {
 const db=await database(t);await bootstrapApp(db);const sessions=createStudySessionsRepository(db),outcomes=createStudyOutcomeRepository(db),source=createStudyItemsRepository(db);
 let id=0;const version=(await db.contentState.get('question-bank')).contentVersion;
 const deps={sessions,source,contentVersion:version,idGenerator:()=> 'session-'+(++id),now:()=>now,rng:()=>0};
 return {db,sessions,outcomes,source,deps,start:request=>startStudySession(request,deps)};
}
export const taskRequest=(count=2)=>({mode:'task',taskTypes:['read-aloud'],itemCount:count});
export function outcome(session,index=session.currentIndex,id='attempt-'+index) {
 const itemId=session.itemIds[index],taskType=itemId.startsWith('ra-')?'read-aloud':itemId.startsWith('rs-')?'repeat-sentence':'write-from-dictation';
 return {attempt:{id,itemId,taskType,sessionId:session.id,itemRevision:1,createdAt:now,score:.8},
 errors:[{...history.errors[0],id:'error-'+id,attemptId:id,itemId,taskType}],
 reviews:[{...history.reviews[0],id:'review-'+id,sourceAttemptId:id,sourceErrorId:'error-'+id,itemId,taskType}],
 sessionProgress:{sessionId:session.id,expectedIndex:index,expectedItemId:itemId,finishedAt:now}};
}
