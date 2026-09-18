'use client';

import { useState } from 'react';
import ToggleSwitch from '@/components/ToggleSwitch';
import { BUTTON_PRIMARY, Card, INPUT } from '@/components/ui';
import type { Settings } from './types';

// 판매자 정보 입력칸. 라벨과 설정 키를 한 곳에 묶어 둔다.
const BUSINESS_FIELDS: [keyof Settings, string][] = [
  ['bizName', '상호'],
  ['bizOwner', '대표자'],
  ['bizRegNo', '사업자등록번호'],
  ['bizMailOrderNo', '통신판매업신고번호'],
  ['bizAddress', '사업장 주소'],
  ['bizTel', '연락처'],
  ['bizEmail', '이메일'],
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

export default function SettingsTab({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (next: Settings) => Promise<string | null>;
}) {
  // 저장된 값(props)과 편집 중인 값을 따로 둔다. 다르면 저장 버튼이 켜지고, 같으면 꺼진다.
  // 이 탭은 설정이 다 읽힌 뒤에만 마운트되고, 저장하면 부모가 같은 값을 다시 읽어 오므로
  // props 를 다시 draft 로 옮길 일이 없다.
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const message = await onSave(draft);
    setSaving(false);
    if (message) setError(message);
    else setSaved(true);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">운영</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="최대 구독자 수" hint="좌석 수 상한. Brevo 일 300통에 맞춰 잡습니다.">
            <input type="number" min={0} value={draft.maxSubscribers} onChange={(e) => set('maxSubscribers', e.target.value)} className={INPUT} />
          </Field>
          <Field label="연간 구독료 (원)" hint="0 이면 결제창 없이 무료로 구독됩니다. 1~999 는 카드 최소 승인금액 미만이라 1,000원으로 처리됩니다.">
            <input type="number" min={0} value={draft.subscriptionPrice} onChange={(e) => set('subscriptionPrice', e.target.value)} className={INPUT} />
          </Field>
          <Field label="유저별 일일 최대 발송" hint="하루에 한 사람에게 보낼 메일 수. 넘치면 생략으로 기록됩니다.">
            <input type="number" min={0} value={draft.maxEmailsPerUserPerDay} onChange={(e) => set('maxEmailsPerUserPerDay', e.target.value)} className={INPUT} />
          </Field>
          <Field label="신규 구독 접수" hint="끄면 좌석이 없는 사람의 결제가 막힙니다. 기존 좌석의 갱신은 그대로 됩니다.">
            <div className="flex items-center gap-3 h-[38px]">
              <ToggleSwitch
                checked={draft.registrationOpen === 'true'}
                onChange={() => set('registrationOpen', draft.registrationOpen === 'true' ? 'false' : 'true')}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">{draft.registrationOpen === 'true' ? '접수 중' : '중단됨'}</span>
            </div>
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          판매자 정보 <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">전자상거래 고지 · /policy 에 그대로 표시, 비워두면 &quot;미등록&quot;</span>
        </h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BUSINESS_FIELDS.map(([key, label]) => (
            <div key={key} className={key === 'bizAddress' ? 'lg:col-span-2' : ''}>
              <Field label={label}>
                <input type="text" maxLength={200} value={draft[key]} onChange={(e) => set(key, e.target.value)} className={INPUT} />
              </Field>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={!dirty || saving} className={BUTTON_PRIMARY}>
          {saving ? '저장 중...' : '설정 저장'}
        </button>
        {dirty && !saving && <span className="text-xs text-amber-600 dark:text-amber-400">저장되지 않은 변경이 있습니다.</span>}
        {saved && !dirty && <span className="text-xs text-green-600 dark:text-green-400">저장됨</span>}
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
