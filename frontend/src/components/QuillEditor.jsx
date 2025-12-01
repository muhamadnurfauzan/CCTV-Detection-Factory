import React, { useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const QuillEditor = ({ value, onChange, disabled }) => {
  const quillRef = useRef(null);

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ],
  };

  return (
    <div>
      <ReactQuill
        ref={quillRef}
        value={value}
        onChange={onChange}
        modules={modules}
        formats={['header', 'bold', 'italic', 'underline', 'color', 'background', 'list', 'bullet', 'align', 'link', 'image']}
        theme="snow"
        readOnly={disabled}
        className={disabled ? 'quill-disabled' : ''}
        style={{ background: disabled ? '#f9fafb' : 'white' }}
      />
    </div>
  );
};

export default QuillEditor;