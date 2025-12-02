// src/components/EmailTemplateEditor.jsx
import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, Decoration } from '@codemirror/view';

// === Variabel Tags ===
const EMAIL_TAGS = [
  { label: 'Full Name',        value: '${full_name}' },
  { label: 'Violation Type',   value: '${violation_name}' },
  { label: 'CCTV Name',        value: '${cctv_name}' },
  { label: 'Location',         value: '${location}' },
  { label: 'Time of Incident', value: '${timestamp}' },
];

const EmailTemplateEditor = ({ template, setTemplate, isEditing }) => {
  const [wrapEnabled, setWrapEnabled] = useState(true)
  
  // Fungsi insert tag ke field apapun (subject atau body)
  const insertTag = (field, tagValue) => {
    setTemplate(prev => ({
      ...prev,
      [field]: prev[field] + tagValue
    }));
  };

  // Highlight placeholder kuning di CodeMirror
  const placeholderHighlight = EditorView.decorations.of(view => {
    const regex = /\$\{\w+\}/g;
    const decos = [];
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      let match;
      while ((match = regex.exec(text)) !== null) {
        decos.push(Decoration.mark({
          class: 'bg-yellow-200 text-amber-900 font-bold rounded px-1'
        }).range(from + match.index, from + match.index + match[0].length));
      }
    }
    return Decoration.set(decos);
  });

  return (
    <div className="space-y-6">
      {/* ========== TAG BUTTONS – DIPAKAI BERSAMA SUBJECT & BODY ========== */}
      <div>
        <p className="text-sm font-medium text-gray-600 mb-3">Available Tags (click or drag)</p>
        <div className="flex flex-wrap gap-2">
          {EMAIL_TAGS.map(tag => (
            <button
              key={tag.value}
              type="button"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', tag.value)}
              onClick={() => {
                // Otomatis masuk ke field yang sedang aktif (subject atau body)
                const activeEl = document.activeElement;
                if (activeEl?.name === 'subject_template') {
                  insertTag('subject_template', tag.value);
                } else {
                  insertTag('body_template', tag.value);
                }
              }}
              disabled={!isEditing}
              className="px-4 py-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-full hover:bg-amber-200 disabled:opacity-50 transition"
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* ========== SUBJECT ========== */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Subject Template
        </label>
        <input
          type="text"
          name="subject_template"
          value={template.subject_template}
          onChange={e => setTemplate(prev => ({ ...prev, subject_template: e.target.value }))}
          disabled={!isEditing}
          placeholder="[URGENT] PPE Violation: ${violation_name} at ${location}"
          className="w-full px-4 py-3 border rounded-lg font-mono text-sm disabled:bg-gray-50 focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-500 mt-1">Tags are optional in the subject</p>
      </div>

      {/* ========== BODY EDITOR + PREVIEW ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-semibold text-gray-700">
              Body Template (HTML)
            </label>

            {/* TOMBOL WRAP TEXT */}
            <button
              type="button"
              onClick={() => setWrapEnabled(!wrapEnabled)}
              disabled={!isEditing}
              className={`
                flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition
                ${wrapEnabled 
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
                ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title={wrapEnabled ? 'Turn off wrap text' : 'Enable wrap text'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {wrapEnabled ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h12a4 4 0 010 8H4V12z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
              <span>{wrapEnabled ? 'Wrap Text' : 'No Wrap'}</span>
            </button>
          </div>

          <div className={wrapEnabled ? '' : 'overflow-x-auto'}>
            <CodeMirror
              value={template.body_template}
              height="600px"
              extensions={[
                html(),
                placeholderHighlight,
                // Hanya aktifkan lineWrapping jika wrapEnabled = true
                ...(wrapEnabled ? [EditorView.lineWrapping] : [])
              ]}
              theme={oneDark}
              onChange={(value) => setTemplate(prev => ({ ...prev, body_template: value }))}
              readOnly={!isEditing}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
              }}
              // Tambahan: paksa wrap via CSS kalau lineWrapping tidak aktif
              className={!wrapEnabled ? 'cm-no-wrap' : ''}
            />
          </div>

          {/* Optional: CSS tambahan kalau butuh lebih halus */}
          <style jsx>{`
            .cm-no-wrap .cm-content {
              white-space: pre !important;
            }
            .cm-no-wrap .cm-line {
              white-space: pre !important;
            }
          `}</style>
        </div>

        {/* Preview tetap sama */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Live Preview
          </label>
          <iframe
            title="preview"
            srcDoc={template.body_template || '<body><p style="padding:40px;color:#999;font-family:sans-serif;">Preview akan muncul di sini</p></body>'}
            className="w-full h-[600px] border rounded-lg bg-white shadow-inner"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
};

export default EmailTemplateEditor;