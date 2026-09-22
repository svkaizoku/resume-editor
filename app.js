/* Resume Editor — vanilla JS, no dependencies.
 *
 * Data flows one way: a single `state` object is the source of truth.
 *  - Text edits write straight into state via a dotted data-path, then re-render
 *    ONLY the preview (so the input keeps focus / caret position).
 *  - Structural edits (add/remove a skill, block, or bullet) mutate state and
 *    then re-render BOTH the form and the preview.
 * State autosaves to localStorage on every change and is portable via JSON.
 */

const STORAGE_KEY = "resume-editor:data";
let state = null;

/* ---------- path helpers: get/set nested values by "a.b.0.c" ---------- */
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

/* ---------- persistence ---------- */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }
}

async function loadSeed() {
  const res = await fetch("resume-data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load seed (HTTP ${res.status})`);
  return res.json();
}

async function init() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      state = JSON.parse(stored);
    } catch {
      state = null;
    }
  }
  if (!state) {
    try {
      state = await loadSeed();
    } catch (e) {
      // Opened directly via file:// where fetch is blocked — start blank.
      console.warn(e);
      state = blankResume();
    }
  }
  normalize(state);
  renderAll();
  wireToolbar();
}

function blankResume() {
  return {
    name: "Your Name",
    title: "",
    contact: { email: "", phone: "", location: "", links: [] },
    summary: "",
    skills: [],
    languages: [],
    experience: [],
    education: [],
    extras: [],
  };
}

/* Ensure all expected arrays/objects exist so rendering never trips. */
function normalize(s) {
  s.contact = s.contact || {};
  s.contact.links = s.contact.links || [];
  for (const k of ["skills", "languages", "experience", "education", "extras"]) {
    if (!Array.isArray(s[k])) s[k] = [];
  }
  s.experience.forEach((e) => (e.bullets = e.bullets || []));
  s.extras.forEach((e) => (e.items = e.items || []));
}

/* ---------- tiny DOM builders ---------- */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

/* An input/textarea bound to a state path. Text edits re-render preview only. */
function boundField(label, path, { textarea = false, placeholder = "" } = {}) {
  const value = getPath(state, path) ?? "";
  const input = el(textarea ? "textarea" : "input", {
    "data-path": path,
    placeholder,
    rows: textarea ? 3 : null,
    oninput: (e) => {
      setPath(state, path, e.target.value);
      save();
      renderPreview();
    },
  });
  input.value = value;
  return el("div", { class: "field" }, [el("label", { text: label }), input]);
}

/* ---------- render: FORM ---------- */
function renderForm() {
  const f = document.getElementById("editor");
  f.innerHTML = "";

  // Basics
  f.appendChild(el("h2", { text: "Basics" }));
  f.appendChild(boundField("Full name", "name"));
  f.appendChild(boundField("Headline / title", "title"));
  f.appendChild(boundField("Summary", "summary", { textarea: true }));

  // Contact
  f.appendChild(el("h2", { text: "Contact" }));
  const contactRow = el("div", { class: "row" }, [
    boundField("Email", "contact.email"),
    boundField("Phone", "contact.phone"),
  ]);
  f.appendChild(contactRow);
  f.appendChild(boundField("Location", "contact.location"));
  state.contact.links.forEach((_, i) => {
    f.appendChild(
      el("div", { class: "row" }, [
        boundField("Link label", `contact.links.${i}.label`),
        withRemove(boundField("Link URL", `contact.links.${i}.url`), () =>
          removeFrom(state.contact.links, i)
        ),
      ])
    );
  });
  f.appendChild(
    addButton("+ Add link", () =>
      pushTo(state.contact.links, { label: "", url: "" })
    )
  );

  // Skills (chips)
  f.appendChild(el("h2", { text: "Skills" }));
  const chips = el("div", { class: "chips" });
  state.skills.forEach((skill, i) => {
    chips.appendChild(
      el("span", { class: "chip" }, [
        skill,
        el("button", {
          type: "button",
          title: "Remove",
          text: "×",
          onclick: () => removeFrom(state.skills, i),
        }),
      ])
    );
  });
  f.appendChild(chips);
  const skillInput = el("input", {
    placeholder: "Type a skill and press Enter",
    onkeydown: (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v) {
          state.skills.push(v);
          renderAll();
          save();
        }
      }
    },
  });
  f.appendChild(el("div", { class: "field" }, [skillInput]));

  // Languages
  f.appendChild(el("h2", { text: "Languages" }));
  state.languages.forEach((_, i) => {
    f.appendChild(
      withRemove(
        el("div", { class: "row" }, [
          boundField("Language", `languages.${i}.name`),
          boundField("Level", `languages.${i}.level`),
        ]),
        () => removeFrom(state.languages, i)
      )
    );
  });
  f.appendChild(
    addButton("+ Add language", () =>
      pushTo(state.languages, { name: "", level: "" })
    )
  );

  // Experience
  f.appendChild(el("h2", { text: "Experience" }));
  state.experience.forEach((exp, i) => f.appendChild(experienceBlock(exp, i)));
  f.appendChild(
    addButton("+ Add experience", () =>
      pushTo(state.experience, {
        role: "",
        company: "",
        start: "",
        end: "",
        location: "",
        summary: "",
        bullets: [""],
      })
    )
  );

  // Education
  f.appendChild(el("h2", { text: "Education" }));
  state.education.forEach((_, i) => {
    f.appendChild(
      block(`Education ${i + 1}`, () => removeFrom(state.education, i), [
        boundField("Degree", `education.${i}.degree`),
        boundField("School", `education.${i}.school`),
        el("div", { class: "row" }, [
          boundField("Start", `education.${i}.start`),
          boundField("End", `education.${i}.end`),
        ]),
      ])
    );
  });
  f.appendChild(
    addButton("+ Add education", () =>
      pushTo(state.education, { degree: "", school: "", start: "", end: "" })
    )
  );

  // Extra sections
  f.appendChild(el("h2", { text: "Other sections" }));
  f.appendChild(
    el("p", {
      class: "hint",
      text: "Certifications, volunteering, awards — each with a heading and a list of items.",
    })
  );
  state.extras.forEach((extra, i) => f.appendChild(extraBlock(extra, i)));
  f.appendChild(
    addButton("+ Add section", () =>
      pushTo(state.extras, { heading: "New section", items: [""] })
    )
  );
}

function experienceBlock(exp, i) {
  const bulletList = el("ul", { class: "bullets" });
  exp.bullets.forEach((_, bi) => {
    const ta = el("textarea", {
      rows: 2,
      "data-path": `experience.${i}.bullets.${bi}`,
      oninput: (e) => {
        state.experience[i].bullets[bi] = e.target.value;
        save();
        renderPreview();
      },
    });
    ta.value = exp.bullets[bi];
    bulletList.appendChild(
      el("li", {}, [
        ta,
        el("button", {
          type: "button",
          class: "mini danger",
          text: "×",
          title: "Remove bullet",
          onclick: () => removeFrom(exp.bullets, bi),
        }),
      ])
    );
  });

  return block(exp.role || `Experience ${i + 1}`, () => removeFrom(state.experience, i), [
    boundField("Role / title", `experience.${i}.role`),
    boundField("Company", `experience.${i}.company`),
    el("div", { class: "row" }, [
      boundField("Start", `experience.${i}.start`),
      boundField("End", `experience.${i}.end`),
    ]),
    boundField("Location", `experience.${i}.location`),
    boundField("One-line description", `experience.${i}.summary`),
    el("label", { class: "field", text: "Bullets" }),
    bulletList,
    addButton("+ Add bullet", () => pushTo(exp.bullets, "")),
  ]);
}

function extraBlock(extra, i) {
  const itemList = el("ul", { class: "bullets" });
  extra.items.forEach((_, ii) => {
    const ta = el("textarea", {
      rows: 2,
      oninput: (e) => {
        state.extras[i].items[ii] = e.target.value;
        save();
        renderPreview();
      },
    });
    ta.value = extra.items[ii];
    itemList.appendChild(
      el("li", {}, [
        ta,
        el("button", {
          type: "button",
          class: "mini danger",
          text: "×",
          title: "Remove item",
          onclick: () => removeFrom(extra.items, ii),
        }),
      ])
    );
  });

  return block(extra.heading || `Section ${i + 1}`, () => removeFrom(state.extras, i), [
    boundField("Heading", `extras.${i}.heading`),
    el("label", { class: "field", text: "Items" }),
    itemList,
    addButton("+ Add item", () => pushTo(extra.items, "")),
  ]);
}

/* ---------- form structural helpers ---------- */
function block(title, onRemove, children) {
  return el("div", { class: "block" }, [
    el("div", { class: "block-head" }, [
      el("span", { class: "idx", text: title }),
      el("button", {
        type: "button",
        class: "mini danger",
        text: "Remove",
        onclick: onRemove,
      }),
    ]),
    ...children,
  ]);
}
function withRemove(fieldNode, onRemove) {
  const wrap = el("div", { class: "field" });
  const head = el("div", { class: "block-head" }, [
    el("span", {}),
    el("button", { type: "button", class: "mini danger", text: "×", onclick: onRemove }),
  ]);
  wrap.appendChild(head);
  wrap.appendChild(fieldNode);
  return wrap;
}
function addButton(label, onAdd) {
  return el("button", { type: "button", class: "add-btn", text: label, onclick: onAdd });
}
function pushTo(arr, item) {
  arr.push(item);
  renderAll();
  save();
}
function removeFrom(arr, i) {
  arr.splice(i, 1);
  renderAll();
  save();
}

/* ---------- render: PREVIEW ---------- */
function section(heading, bodyNodes) {
  return el("div", { class: "r-section" }, [
    el("h3", { text: heading }),
    ...[].concat(bodyNodes),
  ]);
}

function renderPreview() {
  const p = document.getElementById("preview");
  p.innerHTML = "";

  p.appendChild(el("h1", { class: "r-name", text: state.name || "" }));
  if (state.title) p.appendChild(el("div", { class: "r-title", text: state.title }));

  const contactBits = [];
  const c = state.contact || {};
  if (c.location) contactBits.push(el("span", { text: c.location }));
  if (c.phone) contactBits.push(el("span", { text: c.phone }));
  if (c.email) contactBits.push(el("a", { href: `mailto:${c.email}`, text: c.email }));
  (c.links || []).forEach((l) => {
    if (l.url) contactBits.push(el("a", { href: l.url, text: l.label || l.url }));
  });
  p.appendChild(el("div", { class: "r-contact" }, contactBits));
  p.appendChild(el("hr"));

  if (state.summary) {
    p.appendChild(section("Summary", el("p", { class: "r-summary", text: state.summary })));
  }

  if (state.experience.length) {
    p.appendChild(
      section(
        "Experience",
        state.experience.map((e) => experienceItem(e))
      )
    );
  }

  if (state.skills.length) {
    const skills = el(
      "div",
      { class: "r-skills" },
      state.skills.map((s) => el("span", { class: "r-skill", text: s }))
    );
    p.appendChild(section("Skills", skills));
  }

  if (state.education.length) {
    p.appendChild(
      section(
        "Education",
        state.education.map((e) =>
          el("div", { class: "r-item" }, [
            el("div", { class: "r-item-top" }, [
              el("div", {}, [
                el("span", { class: "r-item-role", text: e.degree || "" }),
                e.school ? el("span", { class: "r-item-org", text: ` — ${e.school}` }) : null,
              ]),
              el("span", { class: "r-item-meta", text: dateRange(e.start, e.end) }),
            ]),
          ])
        )
      )
    );
  }

  if (state.languages.length) {
    const langs = el(
      "div",
      { class: "r-langs" },
      state.languages.map((l) =>
        el("span", { class: "r-lang" }, [
          el("b", { text: l.name || "" }),
          l.level ? el("span", { text: ` — ${l.level}` }) : null,
        ])
      )
    );
    p.appendChild(section("Languages", langs));
  }

  state.extras.forEach((x) => {
    if (!x.heading && !(x.items || []).some((i) => i.trim())) return;
    const ul = el(
      "ul",
      { class: "r-extra-items" },
      (x.items || []).filter((i) => i.trim()).map((i) => el("li", { text: i }))
    );
    p.appendChild(section(x.heading || "", ul));
  });
}

function experienceItem(e) {
  const bullets = (e.bullets || []).filter((b) => b.trim());
  return el("div", { class: "r-item" }, [
    el("div", { class: "r-item-top" }, [
      el("div", {}, [
        el("span", { class: "r-item-role", text: e.role || "" }),
        e.company ? el("span", { class: "r-item-org", text: ` — ${e.company}` }) : null,
      ]),
      el("span", { class: "r-item-meta", text: [dateRange(e.start, e.end), e.location].filter(Boolean).join("  ·  ") }),
    ]),
    e.summary ? el("div", { class: "r-item-desc", text: e.summary }) : null,
    bullets.length
      ? el("ul", {}, bullets.map((b) => el("li", { text: b })))
      : null,
  ]);
}

function dateRange(start, end) {
  if (start && end) return `${start} – ${end}`;
  return start || end || "";
}

/* ---------- render all ---------- */
function renderAll() {
  renderForm();
  renderPreview();
}

/* ---------- toolbar ---------- */
function wireToolbar() {
  document.getElementById("btn-export-pdf").addEventListener("click", () => window.print());

  document.getElementById("btn-export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", {
      href: url,
      download: `${(state.name || "resume").replace(/\s+/g, "_")}.json`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const fileInput = document.getElementById("file-import");
  document.getElementById("btn-import-json").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      state = parsed;
      normalize(state);
      renderAll();
      save();
    } catch (err) {
      alert("Could not import: file is not valid resume JSON.\n" + err.message);
    }
    fileInput.value = "";
  });

  document.getElementById("btn-reset").addEventListener("click", async () => {
    if (!confirm("Reset to the original seed resume? This discards your local edits.")) return;
    localStorage.removeItem(STORAGE_KEY);
    try {
      state = await loadSeed();
    } catch {
      state = blankResume();
    }
    normalize(state);
    renderAll();
    save();
  });
}

init();
