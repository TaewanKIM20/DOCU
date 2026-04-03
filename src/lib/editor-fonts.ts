export interface EditorFontOption {
  label: string
  value: string
}

export const EDITOR_FONT_FAMILIES: EditorFontOption[] = [
  {
    label: '맑은 고딕',
    value: "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
  },
  {
    label: 'Noto Sans KR',
    value: "'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif",
  },
  {
    label: '나눔고딕',
    value: "'Nanum Gothic', 'Malgun Gothic', 'Noto Sans KR', sans-serif",
  },
  {
    label: '굴림',
    value: "Gulim, 'Malgun Gothic', 'Noto Sans KR', sans-serif",
  },
  {
    label: '돋움',
    value: "Dotum, 'Malgun Gothic', 'Noto Sans KR', sans-serif",
  },
  {
    label: '바탕',
    value: "Batang, 'Noto Serif KR', 'Nanum Myeongjo', serif",
  },
  {
    label: 'Noto Serif KR',
    value: "'Noto Serif KR', Batang, 'Nanum Myeongjo', serif",
  },
  {
    label: '나눔명조',
    value: "'Nanum Myeongjo', 'Noto Serif KR', Batang, serif",
  },
  {
    label: '궁서',
    value: "Gungsuh, Batang, 'Noto Serif KR', serif",
  },
  {
    label: 'Aptos',
    value: "Aptos, Calibri, 'Segoe UI', Arial, sans-serif",
  },
  {
    label: 'Calibri',
    value: "Calibri, Aptos, 'Segoe UI', Arial, sans-serif",
  },
  {
    label: 'Arial',
    value: "Arial, 'Helvetica Neue', sans-serif",
  },
  {
    label: 'Cambria',
    value: "Cambria, 'Times New Roman', Georgia, serif",
  },
  {
    label: 'Times New Roman',
    value: "'Times New Roman', Cambria, Georgia, serif",
  },
  {
    label: 'Courier New',
    value: "'Courier New', Consolas, monospace",
  },
]

export const EDITOR_FONT_CSS_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700;800&family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@400;600;700&display=swap');`
