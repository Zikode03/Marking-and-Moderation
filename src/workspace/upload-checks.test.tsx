import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UploadWizard from './UploadWizard';
import type { Academics } from './types';
const { inspect, upload }=vi.hoisted(()=>({inspect:vi.fn(),upload:vi.fn()}));
vi.mock('./inspectUpload',()=>({inspectUpload:inspect}));
vi.mock('../auth/session',()=>({uploadWithProgress:upload}));
const academics: Academics={grades:[10],faculties:[],modules:[],staff:[],allocations:[{id:'a',userId:'u',grade:10,subject:'Mathematics',moduleId:null}]};
const file=(name:string)=>new File(['%PDF-1.4 '+name],name,{type:'application/pdf'});
beforeEach(()=>{inspect.mockReset();upload.mockReset();inspect.mockImplementation(async(f:File)=>({pages:2,hash:f.name}));});
async function prepare() {
  render(<UploadWizard selection={{organisationType:'school',sector:'public',pathway:'caps'}} academics={academics} manager={false} onUploaded={vi.fn()} onClose={vi.fn()}/>);
  await userEvent.type(screen.getByLabelText('Batch title'),'Term 3'); await userEvent.click(screen.getByRole('button',{name:'Continue'}));
  await userEvent.upload(screen.getByLabelText('Existing question paper'),file('paper.pdf')); await userEvent.upload(screen.getByLabelText('Approved memorandum / rubric'),file('memo.pdf'));
  await userEvent.click(screen.getByRole('button',{name:'Continue'}));
  await userEvent.upload(screen.getByLabelText('Add candidate scripts'),[file('C001.pdf'),file('C002.pdf')]);
}
describe('Upload preflight checks',()=>{
  it('blocks duplicate candidate numbers before any upload',async()=>{
    await prepare(); const candidate=screen.getByLabelText('Candidate number for C002.pdf'); await userEvent.clear(candidate); await userEvent.type(candidate,'c001');
    await userEvent.click(screen.getByRole('button',{name:'Continue'}));
    expect(screen.getByRole('alert')).toHaveTextContent('Correct candidate numbers and duplicates'); expect(upload).not.toHaveBeenCalled();
  });
  it('blocks duplicate file contents even when candidate numbers differ',async()=>{
    await prepare(); inspect.mockResolvedValue({pages:2,hash:'identical-content'});
    await userEvent.click(screen.getByRole('button',{name:'Continue'}));
    expect(await screen.findByText('Duplicate script content. Remove this file.')).toBeVisible(); expect(upload).not.toHaveBeenCalled();
  });
  it('shows page-count differences and requires staff confirmation before upload',async()=>{
    await prepare(); await userEvent.type(screen.getByLabelText('Expected pages per script (optional)'),'3');
    await userEvent.click(screen.getByRole('button',{name:'Continue'}));
    expect(await screen.findByText(/Page-count warning:/)).toHaveTextContent('expected 3 pages');
    expect(screen.getByRole('button',{name:'Upload scripts'})).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox')); expect(screen.getByRole('button',{name:'Upload scripts'})).toBeEnabled();
  });
});
