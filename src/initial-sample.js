(() => {
  const STORAGE_KEY = 'gantt-desk:v2:project';

  // 初回だけ、入力不要で画面構成を把握できるサンプルを表示する。
  // すでに保存済みのデータ（空プロジェクトを含む）は絶対に上書きしない。
  if (localStorage.getItem(STORAGE_KEY)) return;

  const toISO = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const addDays = (date, days) => {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  };

  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
  const iso = (offset) => toISO(addDays(monday, offset));

  const project = {
    version: 2,
    id: 'project-initial-sample',
    title: 'サンプル｜開幕プロモーション',
    memo: '初回表示用のサンプルです。タスクを追加・編集すると、この端末の作業データとして保存されます。',
    categories: ['企画', '制作', '券売', '広告', '運営'],
    tasks: [
      { id: 'sample-01', name: '企画骨子を確定', start: iso(0), end: iso(2), category: '企画', color: 'blue', completed: false, milestone: false, deadline: false, note: '社内関係者との目線合わせを含む' },
      { id: 'sample-02', name: 'KV初稿提出', start: iso(3), end: iso(5), category: '制作', color: 'purple', completed: false, milestone: false, deadline: false, note: 'デザイン方向性の確認' },
      { id: 'sample-03', name: 'チケット告知開始', start: iso(8), end: iso(8), category: '券売', color: 'amber', completed: false, milestone: true, deadline: false, note: '公式サイト、SNS、メルマガ' },
      { id: 'sample-04', name: '掲出物入稿', start: iso(10), end: iso(15), category: '広告', color: 'green', completed: false, milestone: false, deadline: false, note: '駅・商業施設媒体' },
      { id: 'sample-05', name: '最終確認締切', start: iso(18), end: iso(18), category: '運営', color: 'red', completed: false, milestone: true, deadline: true, note: '担当別チェックリストを確認' },
      { id: 'sample-06', name: '試合当日', start: iso(20), end: iso(20), category: '運営', color: 'red', completed: false, milestone: true, deadline: false, note: '' }
    ],
    view: {
      start: iso(-3),
      end: iso(25),
      dayWidth: 28,
      rowHeight: 52,
      showCompleted: true
    },
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
})();
