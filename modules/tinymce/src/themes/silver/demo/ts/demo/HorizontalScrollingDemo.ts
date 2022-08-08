/* eslint-disable no-console */
declare let tinymce: any;

export default () => {
  tinymce.init({
    selector: '.inline-editor',
    inline: true,
    plugins: [
      'lists', // Required for list functionality (commands),
      'autolink', // Required for turning pasted text into hyperlinks
      'autosave', // Required to prevent users losing content when they press back
      'preview',
      'help',
      'searchreplace',
      'link',
      'wordcount',
      'table',
      'code',
      'image',
      'charmap',
      'emoticons',
      'media'
    ],
  });
};
