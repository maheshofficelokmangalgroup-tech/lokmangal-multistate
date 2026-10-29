// Restricted rich-text editor: headings, paragraphs, lists, quotes and links only. The server sanitises
// again with an allow-list, so pasted scripts or styles never reach the website.

import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import clsx from 'clsx';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Unlink } from 'lucide-react';
import { useEffect } from 'react';

export function RichText({ value, onChange, id, invalid, describedBy }: { value: string; onChange: (html: string) => void; id?: string; invalid?: boolean; describedBy?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false, horizontalRule: false }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ['https', 'mailto', 'tel'], HTMLAttributes: { rel: 'noopener noreferrer' } }),
    ],
    content: value,
    editorProps: { attributes: { class: 'prose-admin px-3 py-2.5 text-sm', ...(id ? { id } : {}), role: 'textbox', 'aria-multiline': 'true', ...(describedBy ? { 'aria-describedby': describedBy } : {}) } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(editor.isEmpty && !value)) editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);
  if (!editor) return null;
  const btn = (active: boolean, label: string, onClick: () => void, Icon: typeof Bold) => (
    <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick} className={clsx('rounded p-1.5', active ? 'bg-brand-soft text-brand-primary' : 'text-text-secondary hover:bg-line-subtle')}>
      <Icon className="size-4" />
    </button>
  );
  return (
    <div className={clsx('rounded-[var(--radius-control)] border bg-surface focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/30', invalid ? 'border-danger' : 'border-line')}>
      <div className="flex flex-wrap gap-0.5 border-b border-line p-1" role="toolbar" aria-label="Formatting">
        {btn(editor.isActive('bold'), 'Bold', () => editor.chain().focus().toggleBold().run(), Bold)}
        {btn(editor.isActive('italic'), 'Italic', () => editor.chain().focus().toggleItalic().run(), Italic)}
        {btn(editor.isActive('heading', { level: 2 }), 'Heading', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
        {btn(editor.isActive('heading', { level: 3 }), 'Sub-heading', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), Heading3)}
        {btn(editor.isActive('bulletList'), 'Bulleted list', () => editor.chain().focus().toggleBulletList().run(), List)}
        {btn(editor.isActive('orderedList'), 'Numbered list', () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
        {btn(editor.isActive('blockquote'), 'Quote', () => editor.chain().focus().toggleBlockquote().run(), Quote)}
        {btn(editor.isActive('link'), 'Add link', () => {
          const url = window.prompt('Link address (https://… or /page-path/)', editor.getAttributes('link').href ?? '');
          if (url === null) return;
          if (!url) editor.chain().focus().unsetLink().run();
          else if (/^(https:\/\/|mailto:|tel:|\/)/.test(url)) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          else window.alert('Use an address starting with https://, /, mailto: or tel:');
        }, Link2)}
        {editor.isActive('link') && btn(false, 'Remove link', () => editor.chain().focus().unsetLink().run(), Unlink)}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
