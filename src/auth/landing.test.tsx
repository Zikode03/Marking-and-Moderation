import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SignIn from './SignIn';
vi.mock('./AuthProvider',()=>({useAuth:()=>({login:vi.fn(),message:'',restoring:false})}));
describe('Reference-inspired landing page',()=>{
  it('shows the education landing page without a marked script or bottom get-started action',()=>{
    render(<SignIn/>);
    expect(screen.getByRole('heading',{name:/Turn assessment into meaningful learning outcomes/})).toBeVisible();
    expect(screen.queryByRole('tabpanel',{name:'Marked paper'})).not.toBeInTheDocument();
    expect(screen.queryByText('DEMO-001')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'Get started'})).toHaveLength(1);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByText(/Empowering educators/)).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Sign in for schools'})).toBeVisible();
  });
  it('opens staff sign-in and retains school sector and IEB choices',async()=>{
    render(<SignIn/>); await userEvent.click(screen.getAllByRole('button',{name:'Get started'})[0]);
    const dialog=screen.getByRole('dialog',{name:'Staff sign in'});
    await userEvent.click(within(dialog).getByRole('button',{name:/School Grades/}));
    await userEvent.click(within(dialog).getByRole('button',{name:'Private Private / independent school'}));
    await userEvent.click(within(dialog).getByRole('button',{name:'IEB Independent Examinations Board.'}));
    expect(within(dialog).getByLabelText('Email address')).toBeVisible();
    expect(within(dialog).getByText('Private · IEB')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Close sign in'}));
    expect(screen.queryByRole('dialog',{name:'Staff sign in'})).not.toBeInTheDocument();
  });
  it('opens the actual walkthrough and resets playback on close',async()=>{
    const play=vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
    const pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
    render(<SignIn/>); await userEvent.click(screen.getByRole('button',{name:/How it works/}));
    const dialog=screen.getByRole('dialog',{name:'See how it works'});
    const video=dialog.querySelector('video')!;
    expect(video.controls).toBe(true);
    expect(video.querySelector('source')).toHaveAttribute('src','/videos/prospera-walkthrough.mp4');
    expect(play).toHaveBeenCalled();
    video.currentTime=12;
    await userEvent.click(screen.getByRole('button',{name:'Close video'}));
    expect(pause).toHaveBeenCalled(); expect(video.currentTime).toBe(0);
    expect(screen.queryByRole('dialog',{name:'See how it works'})).not.toBeInTheDocument();
    play.mockRestore(); pause.mockRestore();
  });
  it('closes the sign-in dialog when Escape cancellation is received',async()=>{
    render(<SignIn/>); await userEvent.click(screen.getAllByRole('button',{name:'Get started'})[0]);
    fireEvent(screen.getByRole('dialog',{name:'Staff sign in'}),new Event('cancel',{bubbles:false,cancelable:true}));
    expect(screen.queryByRole('dialog',{name:'Staff sign in'})).not.toBeInTheDocument();
  });
  it('gives every information navigation item its own destination',async()=>{
    render(<SignIn/>);
    const nav=screen.getByRole('navigation',{name:'Main navigation'});
    for(const [label,title] of [['Product','One workflow for marking and moderation'],['Solutions','Choose your learning environment'],['About','Academic judgement at the centre'],['Resources','Guides and walkthrough']]){
      await userEvent.click(within(nav).getByRole('button',{name:label}));
      expect(screen.getByRole('dialog',{name:title})).toBeVisible();
      await userEvent.click(screen.getByRole('button',{name:'Close information'}));
    }
    await userEvent.click(screen.getByRole('button',{name:'Sign in'}));
    expect(screen.getByRole('dialog',{name:'Staff sign in'})).toBeVisible();
  });
  it('offers a real staff guide and a sales submission form',async()=>{
    render(<SignIn/>);
    await userEvent.click(screen.getByRole('button',{name:'Resources'}));
    expect(screen.getByRole('link',{name:'Download the staff quick-start guide'})).toHaveAttribute('href','/guides/prospera-staff-guide.txt');
    await userEvent.click(screen.getByRole('button',{name:'Read the marking workflow'}));
    expect(screen.getByRole('dialog',{name:'From script to reviewed result'})).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Close information'}));
    await userEvent.click(screen.getByRole('button',{name:'Contact sales'}));
    expect(screen.queryByRole('button',{name:'Download enquiry'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Send enquiry'})).toBeVisible();
    expect(screen.queryByRole('button',{name:'Pricing'})).not.toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toHaveAttribute('type','email');
  });

  it('sends the enquiry to the backend and confirms only after success',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({sent:true}),{status:200}));
    render(<SignIn/>); await userEvent.click(screen.getByRole('button',{name:'Contact sales'}));
    await userEvent.type(screen.getByLabelText('Your name'),'Teacher Example');
    await userEvent.type(screen.getByLabelText('Work email'),'teacher@example.org');
    await userEvent.type(screen.getByLabelText('School or institution'),'Example School');
    await userEvent.type(screen.getByLabelText('What do you need?'),'Grade 12 marking');
    await userEvent.click(screen.getByRole('button',{name:'Send enquiry'}));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/sales/enquiries'),expect.objectContaining({method:'POST',body:JSON.stringify({name:'Teacher Example',email:'teacher@example.org',organisation:'Example School',requirements:'Grade 12 marking'})}));
    expect(await screen.findByRole('heading',{name:'Enquiry sent'})).toBeVisible();
    fetchMock.mockRestore();
  });
  it('retains the enquiry and displays failure when email cannot be sent',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:503}));
    render(<SignIn/>); await userEvent.click(screen.getByRole('button',{name:'Contact sales'}));
    await userEvent.type(screen.getByLabelText('Your name'),'Teacher');
    await userEvent.type(screen.getByLabelText('Work email'),'teacher@example.org');
    await userEvent.type(screen.getByLabelText('School or institution'),'Example School');
    await userEvent.type(screen.getByLabelText('What do you need?'),'Marking support');
    await userEvent.click(screen.getByRole('button',{name:'Send enquiry'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send your enquiry');
    expect(screen.getByLabelText('What do you need?')).toHaveValue('Marking support');
    expect(screen.queryByText('Enquiry sent')).not.toBeInTheDocument();
    fetchMock.mockRestore();
  });

});
