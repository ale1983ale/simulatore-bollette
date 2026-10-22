import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
export default function AgentProduction({token}:{token:string}){
const [data,setData]=useState<any>(null);const [error,setError]=useState('');
useEffect(()=>{void supabase.rpc('agent_production_data',{p_session_token:token}).then(({data,error})=>{if(error)setError(error.message);else setData(data);});},[token]);
return <section><h2>DATI PRODUZIONE</h2>{error&&<p>{error}</p>}{!data&&!error&&<p>Caricamento...</p>}{data&&<><h3>PRODUZIONE</h3><p>{data.produzione?.length||0} righe</p><h3>RECESSI</h3><p>{data.recessi?.length||0} righe</p></>}</section>;
}
