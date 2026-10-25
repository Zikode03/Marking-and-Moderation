import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AiTrainingWorkspace from './AiTrainingWorkspace';
import type { MarkingFeed } from './markingData';
import type { Assessment } from './types';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../auth/session',()=>({request:api}));
vi.mock('./ScriptPageViewer',()=>({default:({scriptId,title='Original handwriting'}:{scriptId:string;title?:string})=><div aria-label={title}>{scriptId}</div>}));
const assessment:Assessment={id:'a',title:'Mathematics scripts',code:'MATH',criteria:[],totalMarks:0,institution:null,school:{grade:10,subject:'Mathematics',term:1,assessmentType:'Test',schoolType:'Public',pathway:'DBE-NSC',weightPercent:0}};
const batch={id:'b',assessmentId:'a',paperName:'paper.pdf',memoName:'memo.pdf',scriptLanguage:'zu',scripts:[{id:'s1',candidate:'C001',status:'Uploaded',error:null},{id:'s2',candidate:'C002',status:'Uploaded',error:null}]};
const examples=[{id:'e1',scriptId:'s1',questionNumber:'1',question:'Explain',answer:'My method',rubric:'Credit a valid method',marks:8,maxMarks:10,verifiedBy:null},{id:'e2',scriptId:'s2',questionNumber:'1',question:'Explain',answer:'Another method',rubric:'Credit a valid method',marks:7,maxMarks:10,verifiedBy:'reviewer'}];
beforeEach(()=>{api.mockReset();api.mockImplementation(async(path:string)=>{
  if(path==='/api/ai/batches/b/training')return examples;
  if(path==='/api/ai/batches/b')return {...batch,scripts:batch.scripts.map(s=>({...s,batchId:'b',fileName:s.candidate+'.pdf',revision:1,total:null,error:null,result:null,audit:[]}))};
  throw Error('Unavailable batch');
});});
function show({ready=false,empty=false,extra=false}:{ready?:boolean;empty?:boolean;extra?:boolean}={}){
  const feed:MarkingFeed={batches:empty?[]:extra?[batch,{...batch,id:'broken'}]:[batch],model:{ready,status:ready?'ready':'Local AI service unavailable',model:ready?'prospera-test-v1':null,languages:ready?['zu']:[]},error:'',loading:false,refresh:vi.fn()};
  return render(<AiTrainingWorkspace feed={feed} assessments={[assessment]} canLabel canVerify={false} manager={false} canUpload onUpload={vi.fn()}/>);
}
describe('Visible AI and training workspace',()=>{
  it('shows the unavailable service honestly and links collection to the connected local training controls',async()=>{
    show(); expect(screen.getByRole('heading',{name:'The AI service is offline'})).toBeVisible();
    expect(screen.getByRole('link',{name:'Open training controls'})).toHaveAttribute('href','/training');
    expect(screen.getByRole('link',{name:'Download handwriting labelling desk'})).toHaveAttribute('download','prospera-handwriting-labeler.html');
    expect(screen.getByText(/Handwriting recognition and rubric-scoring models can now be trained locally from scratch/)).toBeVisible();
    await waitFor(()=>expect(screen.getByText('Labelled examples').parentElement).toHaveTextContent('2'));
    expect(screen.getByText('Independently verified').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Awaiting verification').parentElement).toHaveTextContent('1');
  });
  it('only labels languages as validated when reported by a ready deployed model',async()=>{
    show({ready:true}); const language=screen.getByText('isiZulu').parentElement!;
    expect(within(language).getByText('Listed in deployed model’s validated languages')).toBeVisible();
    expect(screen.getByText('English').parentElement).toHaveTextContent('No ready model validation reported');
    expect(screen.getByText('prospera-test-v1')).toBeVisible();
  });
  it('opens expert labelling next to the selected script and memorandum',async()=>{
    show(); await userEvent.selectOptions(screen.getByLabelText('Training batch'),'b');
    expect(await screen.findByLabelText('Question number')).toBeVisible();
    expect(await screen.findByLabelText('Approved memorandum')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Preview candidate script'),'s2');
    expect(screen.getByLabelText('Training script')).toHaveValue('s2');
    expect(screen.getByLabelText('Original handwriting')).toHaveTextContent('s2');
    await userEvent.selectOptions(screen.getByLabelText('Training script'),'s1');
    expect(screen.getByLabelText('Preview candidate script')).toHaveValue('s1');
  });
  it('marks incomplete totals when a training batch cannot be read',async()=>{
    show({extra:true}); expect(await screen.findByRole('alert')).toHaveTextContent('Totals below include only successfully loaded batches');
    expect(screen.getByText('Labelled examples').parentElement).toHaveTextContent('partial count');
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
  it('provides an upload entry point when no training scripts have been collected',async()=>{
    show({empty:true}); expect(screen.getByText(/No script batches are available here yet/)).toBeVisible();
    expect(screen.getByRole('button',{name:'Upload training scripts'})).toBeEnabled();
    await waitFor(()=>expect(screen.getByText('Labelled examples').parentElement).toHaveTextContent('0'));
  });
});
