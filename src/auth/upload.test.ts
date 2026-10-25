import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, signIn, uploadWithProgress } from './session';
const xhrs: { upload: { onprogress?: (event: unknown) => void }; headers: Record<string,string>; body?: FormData; status: number; responseText: string; onload?: () => void; onabort?: () => void; abort: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }[] = [];
beforeEach(async () => {
  clearSession(); xhrs.length=0;
  vi.stubGlobal('fetch',vi.fn(async (url:string)=>new Response(JSON.stringify(url.endsWith('/api/me') ? {email:'teacher@example.test',schoolId:'school',roles:['Teacher']} : {accessToken:'access-test',refreshToken:'refresh-test'}),{status:200,headers:{'Content-Type':'application/json'}})));
  vi.stubGlobal('XMLHttpRequest',vi.fn(function () {
    const xhr={upload:{},headers:{},status:200,responseText:'{"id":"saved"}',open:vi.fn(),setRequestHeader:vi.fn((key:string,value:string)=>{(xhr.headers as Record<string,string>)[key]=value;}),send:vi.fn((body:FormData)=>{ Object.assign(xhr,{body}); }),abort:vi.fn(()=>{(xhr as unknown as {onabort:()=>void}).onabort();})};
    xhrs.push(xhr); return xhr;
  }));
  await signIn('teacher@example.test','Test-only-password',{organisationType:'school',sector:'public',pathway:'caps'});
});
afterEach(()=>{clearSession();vi.unstubAllGlobals();});
describe('Authenticated upload transport',()=>{
  it('reports actual upload bytes and lets the browser set the multipart boundary',async()=>{
    const progress=vi.fn(); const form=new FormData(); form.append('scripts',new File(['script'],'C001.pdf'));
    const pending=uploadWithProgress('/api/ai/batches',form,progress,new AbortController().signal);
    const xhr=xhrs[0]; expect(xhr.headers.Authorization).toBe('Bearer access-test'); expect(xhr.headers['Content-Type']).toBeUndefined(); expect(xhr.body).toBe(form);
    xhr.upload.onprogress?.({lengthComputable:true,loaded:25,total:100}); expect(progress).toHaveBeenCalledWith(25);
    xhr.onload?.(); await expect(pending).resolves.toEqual({id:'saved'});
  });
  it('cancels the in-flight upload when the user aborts',async()=>{
    const controller=new AbortController(); const pending=uploadWithProgress('/api/ai/batches',new FormData(),vi.fn(),controller.signal);
    const assertion=expect(pending).rejects.toMatchObject({name:'AbortError'}); controller.abort();
    await assertion; expect(xhrs[0].abort).toHaveBeenCalledOnce();
  });
  it('renews an expired bearer token before retrying a rejected upload',async()=>{
    const pending=uploadWithProgress('/api/ai/batches',new FormData(),vi.fn(),new AbortController().signal);
    xhrs[0].status=401; xhrs[0].responseText='{"title":"Unauthorized"}'; xhrs[0].onload?.();
    await vi.waitFor(()=>expect(xhrs).toHaveLength(2));
    expect(xhrs[1].headers.Authorization).toBe('Bearer access-test'); xhrs[1].onload?.(); await expect(pending).resolves.toEqual({id:'saved'});
  });
});
