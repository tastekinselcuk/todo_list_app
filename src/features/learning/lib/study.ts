import type { Progress, Subject, StudyStatus } from '../stores/learning'
export const studyStatuses:StudyStatus[]=['todo','doing','done']
export const studyNameLimit=80,topicNameLimit=100
export function validStudyName(value:string,limit:number){return value.trim().length>0&&Array.from(value.trim()).length<=limit}
// Reorder visible entries without moving archived entries out of their existing slots.
export function mergeStudyOrder(all:string[],visible:string[]){
 const selected=new Set(visible)
 if(selected.size!==visible.length||visible.some(id=>!all.includes(id)))throw Error('INVALID_LEARNING_ORDER')
 let index=0
 return all.map(id=>selected.has(id)?visible[index++]!:id)
}
export function studyToday(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
export function isStudyDue(date:string|null|undefined,today=studyToday()){return Boolean(date&&date<=today)}
export function studyTopics(subject:Subject,query='',status='all',progress:(sid:string,tid:string)=>Progress,archived=false){
 const term=query.trim().toLocaleLowerCase()
 return subject.topics.filter(topic=>Boolean(topic.archived)===archived&&(status==='all'||progress(subject.id,topic.id).status===status)&&(!term||`${subject.title} ${topic.title}`.toLocaleLowerCase().includes(term)))
}
export function studyPlan(date:string,time:string,minutes:number){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||!Number.isInteger(minutes)||minutes<5||minutes>480)throw Error('INVALID_LEARNING_INPUT')
 const start=new Date(`${date}T${time}:00`)
 if(!Number.isFinite(start.getTime())||studyToday(start)!==date||start.getHours()!==Number(time.slice(0,2))||start.getMinutes()!==Number(time.slice(3)))throw Error('INVALID_LEARNING_INPUT')
 return {starts_at:start.toISOString(),ends_at:new Date(start.getTime()+minutes*60000).toISOString()}
}
