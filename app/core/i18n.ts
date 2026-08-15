export type LanguageCode = "zh-CN" | "en-US" | "ja-JP" | "ko-KR" | "de-DE" | "fr-FR" | "es-ES";

export const languageOptions: { id: LanguageCode; label: string }[] = [
  { id: "zh-CN", label: "简体中文" },
  { id: "en-US", label: "English" },
  { id: "ja-JP", label: "日本語" },
  { id: "ko-KR", label: "한국어" },
  { id: "de-DE", label: "Deutsch" },
  { id: "fr-FR", label: "Français" },
  { id: "es-ES", label: "Español" },
];

const messages: Record<LanguageCode, Record<string, string>> = {
  "zh-CN": { workspace: "工作空间", add: "添加板块", edit: "编辑布局", finish: "完成编辑", save: "保存布局", reset: "恢复默认", settings: "系统设置", fullscreen: "全屏", exitFullscreen: "退出全屏", online: "在线", offline: "离线", checking: "检测中", locked: "已锁定", unlocked: "可移动", float: "悬浮", layer: "层级", remove: "移除", language: "界面语言", theme: "界面主题", surface: "板块外观", close: "关闭" },
  "en-US": { workspace: "Workspace", add: "Add module", edit: "Edit layout", finish: "Finish editing", save: "Save layout", reset: "Reset", settings: "Settings", fullscreen: "Fullscreen", exitFullscreen: "Exit fullscreen", online: "Online", offline: "Offline", checking: "Checking", locked: "Locked", unlocked: "Movable", float: "Float", layer: "Layer", remove: "Remove", language: "Language", theme: "Theme", surface: "Surface", close: "Close" },
  "ja-JP": { workspace: "ワークスペース", add: "モジュール追加", edit: "レイアウト編集", finish: "編集完了", save: "保存", reset: "リセット", settings: "設定", fullscreen: "全画面", exitFullscreen: "全画面終了", online: "オンライン", offline: "オフライン", checking: "確認中", locked: "ロック", unlocked: "移動可能", float: "フロート", layer: "レイヤー", remove: "削除", language: "言語", theme: "テーマ", surface: "外観", close: "閉じる" },
  "ko-KR": { workspace: "작업 공간", add: "모듈 추가", edit: "레이아웃 편집", finish: "편집 완료", save: "저장", reset: "초기화", settings: "설정", fullscreen: "전체 화면", exitFullscreen: "전체 화면 종료", online: "온라인", offline: "오프라인", checking: "확인 중", locked: "잠김", unlocked: "이동 가능", float: "플로팅", layer: "레이어", remove: "삭제", language: "언어", theme: "테마", surface: "표면", close: "닫기" },
  "de-DE": { workspace: "Arbeitsbereich", add: "Modul hinzufügen", edit: "Layout bearbeiten", finish: "Bearbeitung beenden", save: "Speichern", reset: "Zurücksetzen", settings: "Einstellungen", fullscreen: "Vollbild", exitFullscreen: "Vollbild beenden", online: "Online", offline: "Offline", checking: "Prüfen", locked: "Gesperrt", unlocked: "Beweglich", float: "Schwebend", layer: "Ebene", remove: "Entfernen", language: "Sprache", theme: "Thema", surface: "Oberfläche", close: "Schließen" },
  "fr-FR": { workspace: "Espace de travail", add: "Ajouter un module", edit: "Modifier la mise en page", finish: "Terminer", save: "Enregistrer", reset: "Réinitialiser", settings: "Paramètres", fullscreen: "Plein écran", exitFullscreen: "Quitter le plein écran", online: "En ligne", offline: "Hors ligne", checking: "Vérification", locked: "Verrouillé", unlocked: "Mobile", float: "Flottant", layer: "Niveau", remove: "Supprimer", language: "Langue", theme: "Thème", surface: "Surface", close: "Fermer" },
  "es-ES": { workspace: "Espacio de trabajo", add: "Añadir módulo", edit: "Editar diseño", finish: "Terminar edición", save: "Guardar", reset: "Restablecer", settings: "Ajustes", fullscreen: "Pantalla completa", exitFullscreen: "Salir de pantalla completa", online: "En línea", offline: "Sin conexión", checking: "Comprobando", locked: "Bloqueado", unlocked: "Movible", float: "Flotante", layer: "Capa", remove: "Eliminar", language: "Idioma", theme: "Tema", surface: "Superficie", close: "Cerrar" },
};

export function translate(language: LanguageCode, key: string) {
  return messages[language]?.[key] ?? messages["zh-CN"][key] ?? key;
}
