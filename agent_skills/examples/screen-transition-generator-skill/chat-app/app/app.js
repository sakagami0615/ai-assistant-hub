// 固定モックによるチャット。データの保存・送信は一切行わない（状態はメモリのみ）。
const SCENES = {
  greeting: {
    text: 'こんにちは！サポートチャットです。\nご用件を選んでください。',
    recs: [['料金を知りたい', 'pricing'], ['使い方を知りたい', 'howto'], ['担当者と話したい', 'operator']],
  },
  pricing: {
    text: '料金プランは「無料プラン」と「有料プラン」の 2 種類です。\nどちらについて詳しく知りたいですか？',
    recs: [['無料プランの詳細', 'free'], ['有料プランの詳細', 'paid']],
  },
  free: {
    text: '無料プランでは、1 か月あたり 100 件までチャットをご利用いただけます。\n機能制限はありません。',
    recs: [['他の質問をする', 'greeting']],
  },
  paid: {
    text: '有料プランは月額 1,000 円で、チャットを無制限にご利用いただけます。\n優先サポートも付属します。',
    recs: [['他の質問をする', 'greeting']],
  },
  howto: {
    text: [
      '使い方をご説明します。',
      '',
      '1. 画面下部の入力欄にメッセージを入力します。',
      '2. 「送信」を押すと、チャットボットが回答します。',
      '3. 回答の下に表示されるボタンを押すと、関連する話題に進めます。',
      '4. ヘッダーの「新しいチャット」で会話を最初からやり直せます。',
      '5. 「設定」では表示に関する設定を確認できます。',
      '6. 「ヘルプ」では外部のヘルプセンターを開きます。',
      '',
      'よくある質問',
      '',
      'Q. 会話の内容は保存されますか？',
      'A. このデモでは、ページを閉じると会話は消去されます。',
      '',
      'Q. スマートフォンでも使えますか？',
      'A. はい。ブラウザからそのままご利用いただけます。',
      '',
      'Q. 回答が表示されない場合は？',
      'A. ページを再読み込みしてから、もう一度お試しください。',
      '',
      'さらに詳しい手順は、ガイドページをご覧ください。',
    ].join('\n'),
    recs: [['詳しい手順を見る', '/guide.html']],
  },
  operator: {
    text: '申し訳ありません。現在、担当者は対応できる時間外です。\n営業時間は平日 9:00〜18:00 です。',
    recs: [['最初に戻る', 'reset']],
  },
  demo1: {
    text: 'デモシナリオを開始します。\nこれは固定テキスト「デモ開始」を入力したときだけ表示される特別な応答です。',
    recs: [['デモ: 次のステップへ', 'demo2']],
  },
  demo2: {
    text: 'デモシナリオのステップ 2 です。これでデモは完了です。',
    recs: [['デモを終了する', 'reset']],
  },
  unknown: { text: 'すみません、その内容にはお答えできません。下のボタンからお選びください。', recs: [['最初に戻る', 'reset']] },
};

const FIXED_TEXTS = { 'デモ開始': 'demo1' };

const $messages = document.getElementById('messages');
const now = () => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function addMessage(kind, text, recs = []) {
  const m = document.createElement('div');
  m.className = `message ${kind}`;
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  const ts = document.createElement('span');
  ts.className = 'timestamp';
  ts.textContent = now();
  m.append(b, ts);
  if (recs.length) {
    const r = document.createElement('div');
    r.className = 'recommendations';
    for (const [label, next] of recs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => choose(label, next));
      r.append(btn);
    }
    m.append(r);
  }
  $messages.append(m);
}

function botReply(sceneId) {
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = '回答を作成しています…';
  $messages.append(loading);
  setTimeout(() => {
    loading.remove();
    const s = SCENES[sceneId];
    addMessage('bot', s.text, s.recs);
  }, 300);
}

function choose(label, next) {
  if (next.startsWith('/')) {
    location.href = next;
    return;
  }
  if (next === 'reset') {
    reset();
    return;
  }
  addMessage('user', label);
  botReply(next);
}

function reset() {
  $messages.replaceChildren();
  addMessage('bot', SCENES.greeting.text, SCENES.greeting.recs);
}

document.getElementById('new-chat').addEventListener('click', reset);
document.getElementById('clear').addEventListener('click', () => {
  if (confirm('履歴を削除しますか？')) reset();
});
document.getElementById('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMessage('user', text);
  botReply(FIXED_TEXTS[text] ?? 'unknown');
});

document.getElementById('about').addEventListener('click', () => {
  const root = document.getElementById('dialog-root');
  root.innerHTML = `
    <div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <h2 id="about-title">このアプリについて</h2>
        <p>画面遷移図自動生成スキルのお試し用モックアプリです。<br>応答はすべて固定のモックデータです。</p>
        <button type="button" id="close-dialog">閉じる</button>
      </div>
    </div>`;
  document.getElementById('close-dialog').addEventListener('click', () => root.replaceChildren());
});

const external = (window.APP_CONFIG ?? {}).externalUrl ?? 'http://localhost:18081';
document.getElementById('help-link').href = `${external}/`;
document.getElementById('terms-link').href = `${external}/terms.html`;

const clock = document.querySelector('.clock');
setInterval(() => { clock.textContent = now(); }, 250);
clock.textContent = now();

reset();
