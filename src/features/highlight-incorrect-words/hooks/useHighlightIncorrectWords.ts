import{useEffect,useState}from'react';
import{studyItemsRepository}from'../../../data/repositories/studyItemsRepository.ts';
import type{StudyItem}from'../../../domain/pte/types.ts';
export function useHighlightIncorrectWords(){const[items,setItems]=useState<StudyItem[]>([]),[index,setIndex]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);useEffect(()=>{let alive=true;void studyItemsRepository.getByTaskType('highlight-incorrect-words').then(rows=>{if(alive)setItems(rows);}).catch(()=>{if(alive)setError('Unable to load Highlight Incorrect Words items.');}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);return{items,item:items[index],index,loading,error,next:()=>setIndex(i=>(i+1)%Math.max(1,items.length))};}
