async function loadContent() {
  const response = await fetch("content.json");
  const data = await response.json();

  const editor = document.getElementById("editor");
  editor.innerHTML = "";

  Object.keys(data).forEach(section => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<h2>${section}</h2>`;

    if (Array.isArray(data[section])) {
      data[section].forEach((item, index) => {
        const block = document.createElement("div");
        block.innerHTML = `
          <textarea data-section="${section}" data-index="${index}">
            ${JSON.stringify(item, null, 2)}
          </textarea>
        `;
        wrapper.appendChild(block);
      });
    } else {
      wrapper.innerHTML += `
        <textarea data-section="${section}">
          ${JSON.stringify(data[section], null, 2)}
        </textarea>
      `;
    }

    editor.appendChild(wrapper);
  });
}

async function saveContent() {
  const token = document.getElementById("token").value;
  const response = await fetch("content.json");
  const original = await response.json();

  const textareas = document.querySelectorAll("textarea");

  textareas.forEach(t => {
    const section = t.dataset.section;
    const index = t.dataset.index;

    if (index !== undefined) {
      original[section][index] = JSON.parse(t.value);
    } else {
      original[section] = JSON.parse(t.value);
    }
  });

  const content = btoa(JSON.stringify(original, null, 2));

  await fetch("https://api.github.com/repos/EONS-svg/eons.studio/contents/content.json", {
    method: "PUT",
    headers: {
      "Authorization": `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Updated content.json via CMS",
      content: content,
      sha: await getSHA(token)
    })
  });

  alert("Content updated!");
}

async function getSHA(token) {
  const res = await fetch("https://api.github.com/repos/EONS-svg/eons.studio/contents/content.json", {
    headers: { "Authorization": `token ${token}` }
  });
  const data = await res.json();
  return data.sha;
}
