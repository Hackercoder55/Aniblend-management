'use client'
import styles from './finance-wallet.module.css'
export default function FinanceRateTable({label,codeLabel,value,onChange}:{label:string;codeLabel:string;value:string;onChange:(value:string)=>void}) {
 const rows=value.split('\n').filter(s=>s.length).map(s=>{const [code,rate]=s.split('=');return {code,rate:rate||''}})
 const save=(next:typeof rows)=>onChange(next.map(r=>r.code+'='+r.rate).join('\n'))
 return <fieldset style={{border:'1px solid #dce5df',borderRadius:12,padding:14,margin:'16px 0'}}><legend>{label}</legend>{rows.map((row,index)=><div className={styles.formGrid} key={index}><label>{codeLabel}<input aria-label={label+' code '+(index+1)} value={row.code} onChange={e=>save(rows.map((r,i)=>i===index?{...r,code:e.target.value}:r))}/></label><label>Amount (₹)<div style={{display:'flex',gap:6}}><input type="number" min="0" step="0.01" aria-label={label+' amount '+(index+1)} value={row.rate} onChange={e=>save(rows.map((r,i)=>i===index?{...r,rate:e.target.value}:r))}/><button type="button" aria-label={'Remove '+label+' '+(index+1)} onClick={()=>save(rows.filter((_,i)=>i!==index))}>×</button></div></label></div>)}<button type="button" onClick={()=>save([...rows,{code:'',rate:''}])}>+ Add rate</button></fieldset>
}
