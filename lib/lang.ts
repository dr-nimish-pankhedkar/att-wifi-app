export type Lang = 'en' | 'mr';

export const UI = {
  en: {
    back:           'Back',
    stockCheck:     'Stock Check',
    dailyKitchen:   'Daily Kitchen',
    enterPin:       'Enter your PIN to continue',
    hi:             'Hi,',
    checkDate:      'Check date',
    date:           'Date',
    filled:         'Filled',
    morningIn:      'Morning IN',
    closing:        'Closing',
    save:           'Save',
    saving:         'Saving…',
    verifying:      'Verifying…',
    saved:          'Saved!',
    done:           'Done',
    logOther:       (shift: string) => `Log ${shift}`,
    saveBtn:        (label: string, n: number) => `Save ${label} (${n})`,
    saveBtnEmpty:   (label: string) => `Save ${label}`,
    minLevel:       'min level — verify count',
    last:           (qty: number, unit: string, date: string) => `Last: ${qty} ${unit} · ${date}`,
    items:          'items',
    fillOne:        'Fill at least one quantity',
    invalidPin:     'Invalid PIN',
  },
  mr: {
    back:           'मागे',
    stockCheck:     'साठा तपासणी',
    dailyKitchen:   'दैनंदिन स्वयंपाकघर',
    enterPin:       'पुढे जाण्यासाठी PIN टाका',
    hi:             'नमस्कार,',
    checkDate:      'तपासणी तारीख',
    date:           'तारीख',
    filled:         'भरलेले',
    morningIn:      'सकाळचे',
    closing:        'रात्रीचे',
    save:           'जतन करा',
    saving:         'जतन होत आहे…',
    verifying:      'तपासत आहे…',
    saved:          'जतन केले!',
    done:           'झाले',
    logOther:       (shift: string) => `${shift} नोंद करा`,
    saveBtn:        (label: string, n: number) => `${label} जतन करा (${n})`,
    saveBtnEmpty:   (label: string) => `${label} जतन करा`,
    minLevel:       'किमान पातळी — मोजणी तपासा',
    last:           (qty: number, unit: string, date: string) => `मागील: ${qty} ${unit} · ${date}`,
    items:          'वस्तू',
    fillOne:        'किमान एक प्रमाण भरा',
    invalidPin:     'चुकीचा PIN',
  },
} as const;

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  return (localStorage.getItem('lang') as Lang) ?? 'en';
}

export function setLang(l: Lang) {
  localStorage.setItem('lang', l);
}
