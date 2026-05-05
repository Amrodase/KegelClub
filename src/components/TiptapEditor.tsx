import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Underline } from '@tiptap/extension-underline';
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  List, ListOrdered, Palette, Type
} from 'lucide-react';

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 bg-slate-800 rounded-t-md border-b border-slate-700">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2 rounded hover:bg-slate-700 ${editor.isActive('bold') ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`} title="Fett"><Bold size={18} /></button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-2 rounded hover:bg-slate-700 ${editor.isActive('italic') ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`} title="Kursiv"><Italic size={18} /></button>
      <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-2 rounded hover:bg-slate-700 ${editor.isActive('underline') ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`} title="Unterstrichen"><UnderlineIcon size={18} /></button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`p-2 rounded hover:bg-slate-700 ${editor.isActive('strike') ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`} title="Durchgestrichen"><Strikethrough size={18} /></button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-2 rounded hover:bg-slate-700 ${editor.isActive('bulletList') ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`} title="Aufzählung"><List size={18} /></button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-2 rounded hover:bg-slate-700 ${editor.isActive('orderedList') ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`} title="Nummerierung"><ListOrdered size={18} /></button>
      
      <div className="flex items-center gap-1 px-2 border-l border-slate-700">
        <Palette size={18} className="text-slate-400" />
        <input
          type="color"
          onInput={(e: any) => editor.chain().focus().setColor(e.target.value).run()}
          value={editor.getAttributes('textStyle').color || '#ffffff'}
          className="w-6 h-6 rounded cursor-pointer bg-transparent"
          title="Schriftfarbe"
        />
      </div>

      <div className="flex items-center gap-1 px-2 border-l border-slate-700">
        <Type size={18} className="text-slate-400" />
        <select 
          onChange={(e) => editor.chain().focus().setHeading({ level: parseInt(e.target.value) as any }).run()}
          className="bg-slate-900 text-slate-300 text-xs rounded p-1 border border-slate-700"
          title="Schriftgröße"
        >
          <option value="0">Normal</option>
          <option value="1">Groß (H1)</option>
          <option value="2">Mittel (H2)</option>
          <option value="3">Klein (H3)</option>
        </select>
      </div>
    </div>
  );
};

const TiptapEditor = ({ content, onChange }: { content: string, onChange: (html: string) => void }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Color,
      TextStyle,
      Underline,
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  return (
    <div className="border border-slate-700 rounded-md overflow-hidden">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} className="p-4 bg-slate-900 text-white min-h-[200px] prose prose-invert max-w-none" />
    </div>
  );
};

export default TiptapEditor;
