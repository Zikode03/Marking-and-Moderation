import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Workspace from './Workspace';
import AssessmentWorkspace from './AssessmentWorkspace';
import AiBatchReview, { type BatchDetail, type MarkedScript } from './AiBatchReview';
import type { Academics, Assessment } from './types';
import type { MarkingFeed } from './markingData';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../auth/session', async original => ({ ...await original<typeof import('../auth/session')>(), request: api }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('./ScriptPageViewer', () => ({ default: ({ title = 'Candidate script', focusPage = 1 }: { title?: string; focusPage?: number }) => <div aria-label={`${title} viewer`}>Page {focusPage}</div> }));
const academics: Academics = { grades: [8,9,10,11,12], faculties: [{ id:'f', name:'Science', code:'SCI' }], modules:[{id:'m',facultyId:'f',name:'Computing',code:'ICT101'}], allocations:[{id:'allocation',userId:'u',grade:10,subject:'Mathematics',moduleId:null}], staff:[] };
const assessments: Assessment[] = [
  {id:'assessment',code:'MATH',title:'Mathematics exam',totalMarks:0,criteria:[],school:{grade:10,subject:'Mathematics',term:3,assessmentType:'Examination',schoolType:'Public',pathway:'DBE-NSC',weightPercent:0},institution:null},
  {id:'institution',code:'ICT',title:'Computing exam',totalMarks:0,criteria:[],school:null,institution:{facultyId:'f',facultyName:'Science',moduleId:'m',moduleCode:'ICT101',moduleName:'Computing',semester:1,academicYear:2026,assessmentType:'Examination',weightPercent:0}},
];
const statuses = ['Uploaded','Processing','Failed','NeedsAttention','AwaitingModeration','Moderated','Approved'];
const batch = { id:'batch', assessmentId:'assessment', paperName:'paper.pdf',memoName:'memo.pdf',createdAt:'2026-10-20T10:00:00Z',scripts:statuses.map((status,i) => ({ id:`s${i}`, candidate:`C00${i}`, status, error:null })) };
const script = (id='s3', candidate='C003'): MarkedScript => ({id,batchId:'batch',candidate,fileName:`${candidate}.pdf`,status:'AwaitingModeration',revision:1,total:6,error:null,model:'test fixture',result:{needsAttention:true,summary:'Check alternative working',questions:[{number:'1',maxMarks:10,marks:6,evidence:'Student working',memoEvidence:'Approved guide',feedback:'Review this step',needsReview:true,annotations:[{page:2,x:.1,y:.2,width:.2,height:.1,kind:'alternative_answer',note:'Check working'}]}]},audit:[]});
beforeEach(() => { api.mockReset(); api.mockImplementation(async (path:string) => {
  if(path.startsWith('/api/academics')) return academics;
  if(path==='/api/assessments') return assessments;
  if(path==='/api/ai/status') return {ready:false,status:'Awaiting training',model:null};
  if(path==='/api/ai/batches') return [batch,{...batch,id:'institution-batch',assessmentId:'institution'}];
  if(path==='/api/ai/batches/batch') return { ...batch, scripts:[script(),script('s4','C004')] } as BatchDetail;
  if(path.endsWith('/training')) return [];
  return {};
}); });
function workspace(role='Teacher', institution=false) { return render(<Workspace session={{profile:{email:'staff@example.test',roles:[role],schoolId:'school'},portal:'teacher',selection:institution ? {organisationType:'institution',sector:'public'} : {organisationType:'school',sector:'public',pathway:'caps'}}}/>); }
function queue(extra: Partial<React.ComponentProps<typeof AssessmentWorkspace>> = {}) {
  const feed: MarkingFeed = {batches:[batch],model:{ready:false,status:'Awaiting training',model:null},error:'',loading:false,refresh:vi.fn()};
  return render(<AssessmentWorkspace selection={{organisationType:'school',sector:'public',pathway:'caps'}} academics={academics} assessments={assessments.slice(0,1)} manager={false} busy={false} run={async operation => {await operation();return true;}} feed={feed} {...extra}/>);
}
describe('Role dashboards and dedicated queues', () => {
  it('counts AI scripts for the selected school workspace rather than legacy submissions', async () => {
    workspace();
    expect(await screen.findByText('7 scripts across 1 batches')).toBeVisible();
    const card=screen.getByRole('button',{name:/Awaiting moderation.*2/});
    await userEvent.click(card);
    const table=screen.getByRole('table');
    expect(within(table).getByText('C003')).toBeVisible(); expect(within(table).getByText('C004')).toBeVisible();
    expect(within(table).queryByText('C006')).not.toBeInTheDocument();
    expect(api.mock.calls.some(([path]) => path==='/api/submissions')).toBe(false);
  });
  it('shows allocated faculty modules for lecturers', async () => {
    workspace('Lecturer', true);
    expect(await screen.findByText('Science · ICT101 · Computing')).toBeVisible();
    expect(screen.queryByText('Grade 10 · Mathematics',{selector:'li'})).not.toBeInTheDocument();
  });
  it.each([['HOD','Moderation'],['Principal','Approvals']])('lands %s in their own queue', async (role,title) => {
    workspace(role);
    expect(await screen.findByRole('heading',{name:title,level:1})).toBeVisible();
    expect(await screen.findByRole('heading',{name:`${title} queue`})).toBeVisible();
  });
  it('searches and filters marking scripts without mixing approved work into the queue', async () => {
    queue();
    const table=screen.getByRole('table'); expect(within(table).queryByText('C006')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'),'Failed');
    expect(within(table).getByText('C002')).toBeVisible(); expect(within(table).queryByText('C000')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search scripts'),'not-a-candidate');
    expect(screen.getByText('No scripts match these filters.')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Clear filters'}));
    expect(screen.getByRole('table')).toBeVisible();
  });
  it('paginates a large queue and preserves candidate sorting', async () => {
    const scripts=Array.from({length:32},(_,i)=>({id:`id${i}`,candidate:`C${i}`,status:'Uploaded',error:null}));
    queue({feed:{batches:[{...batch,scripts}],model:{ready:true,status:'ready',model:'test'},error:'',loading:false,refresh:vi.fn()}});
    await userEvent.selectOptions(screen.getByLabelText('Sort by'),'candidate');
    expect(screen.getAllByRole('row')).toHaveLength(16);
    await userEvent.click(screen.getByRole('button',{name:'Next page'}));
    expect(screen.getByText('Page 2 of 3')).toBeVisible(); expect(screen.getByText('C15')).toBeVisible();
  });
  it('keeps question marks and reasons when moving between scripts and focuses review circles', async () => {
    queue({queue:'moderation',canModerate:true});
    await userEvent.click(screen.getByRole('button',{name:'Open script C003'}));
    const input=await screen.findByLabelText('Confirmed mark · Question 1');
    expect(await screen.findByLabelText('Approved memorandum viewer')).toBeVisible();
    await userEvent.clear(input); await userEvent.type(input,'8');
    await userEvent.type(screen.getByLabelText('Moderation reason'),'Equivalent method deserves credit.');
    await userEvent.click(screen.getByRole('button',{name:'Show circle · page 2'}));
    expect(screen.getByLabelText('Candidate script viewer')).toHaveTextContent('Page 2');
    fireEvent.keyDown(window,{key:'j',altKey:true});
    await waitFor(()=>expect(screen.getByRole('heading',{name:'Candidate C004'})).toBeVisible());
    expect(screen.getByLabelText('Confirmed mark · Question 1')).toHaveValue(6);
    fireEvent.keyDown(window,{key:'k',altKey:true});
    await waitFor(()=>expect(screen.getByLabelText('Confirmed mark · Question 1')).toHaveValue(8));
    expect(screen.getByLabelText('Moderation reason')).toHaveValue('Equivalent method deserves credit.');
    await userEvent.click(screen.getByRole('button',{name:'Confirm moderation'}));
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/ai/batches/batch/scripts/s3/moderate',expect.objectContaining({method:'POST'})));
    const call=api.mock.calls.find(([path])=>path.endsWith('/moderate'))!;
    expect(JSON.parse(call[1].body)).toMatchObject({revision:1,marks:{'1':8},reason:'Equivalent method deserves credit.'});
  });
  it('blocks a stale draft until it is discarded', async () => {
    const discard=vi.fn();
    render(<AiBatchReview script={{...script(),revision:2}} canModerate canApprove={false} draft={{revision:1,marks:{'1':'8'},reason:'Review'}} onDraftChange={discard} onSaved={async()=>{}}/>);
    expect(screen.getByRole('button',{name:'Confirm moderation'})).toBeDisabled();
    expect(screen.getByText(/This script changed since/)).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Discard draft'})); expect(discard).toHaveBeenCalledWith(undefined);
  });
});
