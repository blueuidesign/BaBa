import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { Header, Icon } from '../components/ui';

type Msg = { role: 'user' | 'assistant'; content: string; error?: boolean; suggestions?: string[] };

/** Hiển thị câu trả lời: chỉ hiểu **đậm**, dòng "### tiêu đề" và gạch đầu dòng "- ". Không chèn HTML thô. */
function bold(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith('**') && x.endsWith('**') && x.length > 4 ? <strong key={i}>{x.slice(2, -2)}</strong> : x));
}
function Rich({ text }: { text: string }) {
  const out: React.ReactElement[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{bold(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) { flush(); continue; }
    if (/^[-•*]\s+/.test(l)) { list.push(l.replace(/^[-•*]\s+/, '')); continue; }
    flush();
    if (/^#{1,4}\s+/.test(l)) out.push(<h4 key={out.length}>{bold(l.replace(/^#{1,4}\s+/, ''))}</h4>);
    else out.push(<p key={out.length}>{bold(l)}</p>);
  }
  flush();
  return <>{out}</>;
}
const SUGGEST = ['Hôm nay bán được bao nhiêu?', '7 ngày qua món nào bán chạy nhất?', 'Tuần này so với tuần trước thế nào?', 'Tháng này đã chi những khoản gì lớn nhất?'];

/** Trợ lý hỏi đáp báo cáo (chỉ đọc). Chỉ chủ cơ sở và admin; câu hỏi gửi lên Edge Function tro-ly. */
export default function Assistant() {
  const { outlet, canManage } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  if (!outlet) return null;

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = [...msgs.filter((m) => !m.error), { role: 'user' as const, content: question }];
    setMsgs((m) => [...m, { role: 'user', content: question }]);
    setText('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('tro-ly', { body: { outlet_id: outlet!.id, messages: history } });
      let err = data?.error as string | undefined;
      if (error && !err) {
        // Lỗi HTTP: thân phản hồi vẫn có câu giải thích
        const body = await (error as any).context?.json?.().catch(() => null);
        err = body?.error || 'Không gọi được trợ lý. Kiểm tra mạng rồi thử lại.';
      }
      setMsgs((m) => [...m, err ? { role: 'assistant', content: err, error: true } : { role: 'assistant', content: data.reply, suggestions: data.suggestions || [] }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Không gọi được trợ lý. Kiểm tra mạng rồi thử lại.', error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <Header title="Hỏi trợ lý" sub={`${outlet.name} · chỉ xem số liệu, không sửa gì`} back />
      <main className="main" style={{ paddingBottom: 96, gap: 10 }}>
        {!canManage ? (
          <section className="card"><p className="small muted">Chỉ chủ cơ sở hoặc admin dùng được trợ lý báo cáo.</p></section>
        ) : (
          <>
            {msgs.length === 0 && (
              <section className="card" style={{ gap: 10 }}>
                <p className="small muted">Hỏi về doanh thu, món bán, tiền mặt và chuyển khoản, các khoản chi. Trợ lý lấy số từ đúng dữ liệu của màn Báo cáo. Lãi theo từng cốc thì chưa trả lời được.</p>
                <div className="chips wrap">
                  {SUGGEST.map((s) => (
                    <button key={s} type="button" className="chip" style={{ fontSize: 13, minHeight: 36 }} onClick={() => ask(s)}>{s}</button>
                  ))}
                </div>
              </section>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role} ${m.error ? 'error' : ''}`}>
                {m.role === 'assistant' && !m.error ? <Rich text={m.content} /> : m.content}
                {/* Câu hỏi gợi ý: chỉ ở câu trả lời mới nhất */}
                {i === msgs.length - 1 && !busy && !!m.suggestions?.length && (
                  <div className="suggest">
                    <span className="xs muted">Bạn muốn xem tiếp?</span>
                    {m.suggestions.map((q) => (
                      <button key={q} type="button" className="chip" onClick={() => ask(q)}>{q}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="bubble assistant muted">Mình đang tra số liệu…</div>}
            <div ref={end} />
          </>
        )}
      </main>
      {canManage && (
        <form className="bar" style={{ bottom: 0, paddingBottom: 'calc(12px + var(--safe-b))' }} onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <div className="row" style={{ gap: 8 }}>
            <label className="input-wrap grow">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Gõ câu hỏi…" aria-label="Câu hỏi cho trợ lý" maxLength={500} enterKeyHint="send" />
            </label>
            <button className="btn" style={{ minWidth: 52 }} disabled={busy || !text.trim()} aria-label="Gửi câu hỏi">
              <Icon name="chev" size={20} sw={2.2} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
