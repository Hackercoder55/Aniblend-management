export type ActivityProject = { Project_ID?: string; 'Date Assigned'?: string | null; 'Date Approved'?: string | null; Approved_Date?: string | null }
const months:Record<string,number>={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12}
function key(y:number,m:number,d:number){const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):''}
export const indiaToday=(now=new Date())=>now.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})
export function activityDate(raw:unknown):string {
 const text=String(raw??'').split('___')[0].trim();if(!text)return ''
 let match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(match)return key(+match[1],+match[2],+match[3])
 match=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(match)return key(+match[3],+match[2],+match[1])
 match=text.match(/^(\d{1,2})[ -]+([a-z]+)[ -]+(\d{2}|\d{4})$/i)
 if(match){const m=months[match[2].toLowerCase()];return m?key(+(match[3].length===2?'20'+match[3]:match[3]),m,+match[1]):''}
 if(/^\d{4}-\d{2}-\d{2}T/.test(text)) {const date=new Date(text);return Number.isFinite(date.getTime())?indiaToday(date):''}
 return ''
}
export const approvalDate=(p:ActivityProject)=>activityDate(p['Date Approved'])||activityDate(p.Approved_Date)
export function projectActivity(projects:ActivityProject[],count=30,now=new Date()) {
 const end=indiaToday(now),last=new Date(end+'T12:00:00Z'),days:{date:string;label:string;assigned:number;approved:number}[]=[]
 for(let n=count-1;n>=0;n--){const d=new Date(last);d.setUTCDate(d.getUTCDate()-n);days.push({date:d.toISOString().slice(0,10),label:d.toLocaleDateString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short'}),assigned:0,approved:0})}
 const assigned=new Set<string>(),approved=new Set<string>()
 for(const [index,p] of projects.entries()) {
  const id=p.Project_ID||'row-'+index,assign=activityDate(p['Date Assigned']),approve=approvalDate(p)
  if(assign&&!assigned.has(id)){assigned.add(id);const d=days.find(d=>d.date===assign);if(d)d.assigned++}
  if(approve&&!approved.has(id)){approved.add(id);const d=days.find(d=>d.date===approve);if(d)d.approved++}
 }
 return days
}
