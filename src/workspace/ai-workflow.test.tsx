import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssessmentWorkspace from './AssessmentWorkspace';
import AiBatchReview from './AiBatchReview';
import ScriptPageViewer from './ScriptPageViewer';
import type { Academics, Assessment } from './types';
const { api, uploadApi, inspect } = vi.hoisted(() => ({api: vi.fn(), uploadApi: vi.fn(), inspect: vi.fn()}));
vi.mock('../auth/session', () => ({request: api, uploadWithProgress: uploadApi}));
vi.mock('./inspectUpload', () => ({inspectUpload: inspect}));
const academics: Academics = {grades:[8,9,10,11,12], faculties:[], modules:[], allocations:[{id:'a',userId:'u',grade:10,subject:'Mathematics',moduleId:null}],staff:[]};
const assessments = [{id:'assessment',title:'Uploaded examination',school:{grade:10,subject:'Mathematics'}}] as Assessment[];
let uploaded = false;
beforeEach(()=>{
  uploaded=false; api.mockReset(); uploadApi.mockReset(); inspect.mockResolvedValue({pages:2,hash:'test-script'});
  uploadApi.mockImplementation(async (path, body, progress) => { progress(100); return api(path, {method:'POST',body}); }); api.mockImplementation(async (path: string, init?: RequestInit)=>{
    if(path==='/api/ai/status') return {ready:false,status:'Awaiting training',model:null};
    if(path==='/api/ai/batches' && init?.method==='POST') {uploaded=true;return {id:'batch',assessmentId:'assessment'};}
    if(path==='/api/ai/batches') return uploaded ? [{id:'batch',assessmentId:'assessment',paperName:'paper.pdf',memoName:'memo.pdf',scripts:[{id:'script',candidate:'C001',status:'Uploaded'}]}] : [];
    if(path==='/api/ai/batches/batch') return {id:'batch',assessmentId:'assessment',paperName:'paper.pdf',memoName:'memo.pdf',scripts:[{id:'script',batchId:'batch',candidate:'C001',fileName:'C001.pdf',status:'Uploaded',revision:1,total:null,error:null,result:null,audit:[]}]};
    if(path.includes('/files/')) return new Blob(['image'],{type:'image/png'});
    if(path.endsWith('/training')) return [];
    throw new Error('Unexpected endpoint '+path);
  });
});
function show(){return render(<AssessmentWorkspace selection={{organisationType:'school',sector:'public',pathway:'caps'}} academics={academics} assessments={assessments} manager={false} busy={false} canLabel run={async operation=>{await operation();return true;}}/>);}
describe('Upload and local AI workflow',()=>{
  it('replaces assessment creation with a saved multipart upload and blocks marking without a model',async()=>{
    show(); expect(screen.queryByRole('button',{name:'Create assessment'})).not.toBeInTheDocument();
    expect(await screen.findByText('Local model not ready')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Upload scripts'}));
    await userEvent.type(screen.getByLabelText('Batch title'),'Term 3 scripts');
    await userEvent.click(screen.getByRole('button',{name:'Continue'}));
    await userEvent.selectOptions(screen.getByLabelText('Script language'), 'zu');
    await userEvent.selectOptions(screen.getByLabelText('Memorandum language'), 'en');
    await userEvent.upload(screen.getByLabelText('Existing question paper'),new File(['%PDF-1.4 paper'],'paper.pdf',{type:'application/pdf'}));
    await userEvent.upload(screen.getByLabelText('Approved memorandum / rubric'),new File(['%PDF-1.4 guide'],'memo.pdf',{type:'application/pdf'}));
    await userEvent.click(screen.getByRole('button',{name:'Continue'}));
    await userEvent.upload(screen.getByLabelText('Add candidate scripts'),new File(['%PDF-1.4 answer'],'C001.pdf',{type:'application/pdf'}));
    const invalid = Array.from(document.querySelectorAll('input,select,textarea')).filter(element => !(element as HTMLInputElement).validity.valid).map(element => ({label:element.closest('label')?.textContent, value:(element as HTMLInputElement).value}));
    expect(invalid).toEqual([]);
    await userEvent.click(screen.getByRole('button',{name:'Continue'}));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button',{name:'Upload scripts'}));
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/ai/batches',expect.objectContaining({method:'POST',body:expect.any(FormData)})));
    const form=api.mock.calls.find(call=>call[1]?.method==='POST')![1].body as FormData;
    expect(form.getAll('scripts')).toHaveLength(1); expect(form.get('memo')).toBeInstanceOf(File);
    expect(JSON.parse(String(form.get('context'))).school.grade).toBe(10);
    expect(JSON.parse(String(form.get('context'))).scriptLanguage).toBe('zu');
    expect(JSON.parse(String(form.get('context'))).memoLanguage).toBe('en');
    await screen.findByRole('heading',{name:'Batch saved'});
    await userEvent.click(screen.getByRole('button',{name:'Back to queue'}));
    expect(await screen.findByRole('button',{name:'Start AI marking'})).toBeDisabled();
    await userEvent.click(screen.getByRole('button',{name:'Open script C001'}));
    expect(await screen.findByText(/Build our training dataset/)).toBeVisible();
  });
  it('places review circles over an authenticated script image and preserves them when zoomed', async()=>{
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-script'); const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(()=>{});
    api.mockResolvedValue(new Blob(['image fixture'], {type:'image/png'}));
    const {container, unmount} = render(<ScriptPageViewer batchId="b" scriptId="s" annotations={[{page:1,x:0.1,y:0.2,width:0.2,height:0.1,kind:'alternative_answer',note:'Check equivalent wording'}]}/>);
    expect(await screen.findByAltText('Original handwritten script, page 1')).toBeVisible();
    const circle=container.querySelector('ellipse')!; expect(circle).toHaveAttribute('cx','0.2'); expect(circle).toHaveAttribute('cy','0.25');
    expect(screen.getByText('Possible alternative answer: Check equivalent wording')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Zoom'), '2'); expect(container.querySelector('.script-page')).toHaveStyle({width:'200%'});
    expect(circle).toHaveAttribute('cx','0.2'); unmount(); expect(revoke).toHaveBeenCalledWith('blob:test-script'); create.mockRestore(); revoke.mockRestore();
  });
  it('withholds totals for unreadable answers and offers no teacher moderation action',()=>{
    render(<AiBatchReview script={{id:'s',batchId:'b',candidate:'C1',fileName:'C1.pdf',status:'NeedsAttention',revision:2,total:null,error:null,model:'test-model',result:{needsAttention:true,summary:'Unreadable answer',questions:[{number:'1',maxMarks:10,marks:null,evidence:'',feedback:'Rescan required',needsReview:true}]},audit:[]}} canModerate={false} canApprove={false} onSaved={async()=>{}}/>);
    expect(screen.getByText('Total withheld until flagged answers are resolved.')).toBeVisible();
    expect(screen.queryByRole('button',{name:'Confirm moderation'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Approve result'})).not.toBeInTheDocument();
  });
});
