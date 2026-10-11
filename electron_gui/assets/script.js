window.getEditorContent = function () {
    const editor = document.getElementById("editor");
    return editor instanceof HTMLTextAreaElement ? editor.value : "";
};
