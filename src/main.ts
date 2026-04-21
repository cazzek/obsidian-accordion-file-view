import {
  App,
  ItemView,
  MarkdownRenderer,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath,
  setIcon,
} from "obsidian";

const VIEW_TYPE_ACCORDION_FILE = "accordion-file-view";

interface AccordionFileSettings {
  folderPath: string;
  searchText: string;
  includeTxtFiles: boolean;
}

const DEFAULT_SETTINGS: AccordionFileSettings = {
  folderPath: "",
  searchText: "",
  includeTxtFiles: true,
};

function isMarkdownFile(file: TFile): boolean {
  return ["md", "markdown", "mdown"].includes(file.extension.toLowerCase());
}

function isSupportedFile(file: TFile, includeTxtFiles: boolean): boolean {
  if (isMarkdownFile(file)) {
    return true;
  }

  return includeTxtFiles && file.extension.toLowerCase() === "txt";
}

class AccordionFileView extends ItemView {
  private plugin: AccordionFilePlugin;
  private openPath = "";
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AccordionFilePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.handleVaultChange = this.handleVaultChange.bind(this);
  }

  getViewType(): string {
    return VIEW_TYPE_ACCORDION_FILE;
  }

  getDisplayText(): string {
    return "Accordion File View";
  }

  getIcon(): string {
    return "layers-3";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.vault.on("create", this.handleVaultChange));
    this.registerEvent(this.app.vault.on("delete", this.handleVaultChange));
    this.registerEvent(this.app.vault.on("rename", this.handleVaultChange));
    this.registerEvent(this.app.vault.on("modify", this.handleVaultChange));
    await this.render();
  }

  onClose(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private handleVaultChange(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.render();
    }, 150);
  }

  async render(): Promise<void> {
    const container = this.contentEl;
    container.replaceChildren();

    const header = container.createDiv({ cls: "accordion-file-view-header" });
    const titleBlock = header.createDiv({ cls: "accordion-file-view-title-block" });
    titleBlock.createEl("h2", { text: "Accordion File View" });
    titleBlock.createEl("p", {
      text: "Markdown and text files are shown as expandable previews.",
      cls: "accordion-file-view-subtitle",
    });

    const controls = header.createDiv({ cls: "accordion-file-view-controls" });
    const searchWrapper = controls.createDiv({ cls: "accordion-file-view-control" });
    searchWrapper.createEl("label", { text: "Filter", cls: "accordion-file-view-label" });
    const searchInput = searchWrapper.createEl("input", {
      type: "search",
      placeholder: "File name or path",
    });
    searchInput.value = this.plugin.settings.searchText;
    searchInput.addEventListener("input", () => {
      this.plugin.settings.searchText = searchInput.value;
      void this.plugin.saveSettings();
      void this.render();
    });

    const folderWrapper = controls.createDiv({ cls: "accordion-file-view-control" });
    folderWrapper.createEl("label", { text: "Folder", cls: "accordion-file-view-label" });
    const folderInput = folderWrapper.createEl("input", {
      type: "text",
      placeholder: "Leave blank for the whole vault",
    });
    folderInput.value = this.plugin.settings.folderPath;
    folderInput.addEventListener("change", () => {
      this.plugin.settings.folderPath = folderInput.value.trim();
      void this.plugin.saveSettings();
      void this.render();
    });

    const actions = controls.createDiv({ cls: "accordion-file-view-actions" });
    const refreshButton = actions.createEl("button", {
      text: "Refresh",
      cls: "mod-cta",
      type: "button",
    });
    refreshButton.addEventListener("click", () => void this.render());

    const toggleButton = actions.createEl("button", {
      text: this.plugin.settings.includeTxtFiles ? "TXT: On" : "TXT: Off",
      type: "button",
    });
    toggleButton.addEventListener("click", async () => {
      this.plugin.settings.includeTxtFiles = !this.plugin.settings.includeTxtFiles;
      toggleButton.textContent = this.plugin.settings.includeTxtFiles ? "TXT: On" : "TXT: Off";
      await this.plugin.saveSettings();
      await this.render();
    });

    const files = this.getFiles();
    const status = container.createDiv({ cls: "accordion-file-view-status" });
    status.setText(this.getStatusText(files.length));

    const list = container.createDiv({ cls: "accordion-file-view-list" });

    if (files.length === 0) {
      list.createDiv({
        text: "No matching files found.",
        cls: "accordion-file-view-empty",
      });
      return;
    }

    for (const file of files) {
      const details = list.createEl("details", {
        cls: "accordion-file-view-item",
      });

      const summary = details.createEl("summary", {
        cls: "accordion-file-view-summary",
      });

      const summaryText = summary.createDiv({ cls: "accordion-file-view-summary-text" });
      summaryText.createEl("span", {
        text: file.basename,
        cls: "accordion-file-view-file-name",
      });
      summaryText.createEl("span", {
        text: file.path,
        cls: "accordion-file-view-file-path",
      });

      const openButton = summary.createEl("button", {
        type: "button",
        cls: "clickable-icon accordion-file-view-open-button",
        attr: { "aria-label": `Open ${file.basename} in the editor` },
      });
      setIcon(openButton, "edit-3");
      openButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.app.workspace.getLeaf(true).openFile(file);
      });

      const body = details.createDiv({ cls: "accordion-file-view-body" });

      details.addEventListener("toggle", async () => {
        if (details.open) {
          this.openPath = file.path;
          for (const other of Array.from(
            list.querySelectorAll("details"),
          ) as HTMLDetailsElement[]) {
            if (other !== details) {
              other.open = false;
            }
          }

          if (!body.dataset.loaded) {
            body.dataset.loaded = "loading";
            await this.renderPreview(file, body);
            body.dataset.loaded = "true";
          }
        } else if (this.openPath === file.path) {
          this.openPath = "";
        }
      });

      if (this.openPath === file.path) {
        details.open = true;
        body.dataset.loaded = "loading";
        await this.renderPreview(file, body);
        body.dataset.loaded = "true";
      }
    }
  }

  private getFiles(): TFile[] {
    const searchText = this.plugin.settings.searchText.trim().toLowerCase();
    const rawFolderPath = this.plugin.settings.folderPath.trim();
    const folderPath = rawFolderPath ? normalizePath(rawFolderPath).replace(/\/+$/, "") : "";

    return this.app.vault
      .getFiles()
      .filter((file) => isSupportedFile(file, this.plugin.settings.includeTxtFiles))
      .filter((file) => {
        if (!folderPath) {
          return true;
        }

        return file.path === folderPath || file.path.startsWith(`${folderPath}/`);
      })
      .filter((file) => {
        if (!searchText) {
          return true;
        }

        return (
          file.basename.toLowerCase().includes(searchText) ||
          file.path.toLowerCase().includes(searchText)
        );
      })
      .sort((left, right) => left.path.localeCompare(right.path, "ja"));
  }

  private getStatusText(count: number): string {
    const folderPath = this.plugin.settings.folderPath.trim();
    const scopeText = folderPath ? `Folder: ${folderPath}` : "Folder: whole vault";
    return `${count} file${count === 1 ? "" : "s"} shown. ${scopeText}`;
  }

  private async renderPreview(file: TFile, containerEl: HTMLElement): Promise<void> {
    try {
      const text = await this.app.vault.cachedRead(file);
      containerEl.replaceChildren();

      if (!text.trim()) {
        containerEl.createDiv({
          text: "This file is empty.",
          cls: "accordion-file-view-empty-preview",
        });
        return;
      }

      if (isMarkdownFile(file)) {
        const previewHost = containerEl.createDiv({
          cls: "markdown-preview-view markdown-rendered accordion-file-view-markdown",
        });
        await MarkdownRenderer.renderMarkdown(text, previewHost, file.path, this.plugin);
        return;
      }

      const pre = containerEl.createEl("pre", {
        cls: "accordion-file-view-plain",
      });
      pre.textContent = text;
    } catch (error) {
      containerEl.replaceChildren();
      containerEl.createDiv({
        text: "Unable to render this file preview.",
        cls: "accordion-file-view-empty-preview",
      });
      console.error("[accordion-file-view] preview render failed", error);
      new Notice("Accordion File View: failed to render preview");
    }
  }
}

class AccordionFileSettingTab extends PluginSettingTab {
  plugin: AccordionFilePlugin;

  constructor(app: App, plugin: AccordionFilePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.replaceChildren();
    containerEl.createEl("h2", { text: "Accordion File View" });
    containerEl.createEl("p", {
      text: "Set an optional folder to narrow the file list. Leave it blank to scan the whole vault.",
    });

    new Setting(containerEl)
      .setName("Target folder")
      .setDesc("Vault-relative folder path, for example 設定資料 or シナリオ.")
      .addText((text) =>
        text
          .setPlaceholder("設定資料")
          .setValue(this.plugin.settings.folderPath)
          .onChange(async (value) => {
            this.plugin.settings.folderPath = value.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          }),
      );

    new Setting(containerEl)
      .setName("Search text")
      .setDesc("Filter by file name or path.")
      .addText((text) =>
        text
          .setPlaceholder("character")
          .setValue(this.plugin.settings.searchText)
          .onChange(async (value) => {
            this.plugin.settings.searchText = value.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          }),
      );

    new Setting(containerEl)
      .setName("Include TXT files")
      .setDesc("Show .txt files alongside Markdown notes.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.includeTxtFiles).onChange(async (value) => {
          this.plugin.settings.includeTxtFiles = value;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        }),
      );
  }
}

export default class AccordionFilePlugin extends Plugin {
  settings: AccordionFileSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.registerView(VIEW_TYPE_ACCORDION_FILE, (leaf) => new AccordionFileView(leaf, this));

    this.addRibbonIcon("layers-3", "Open Accordion File View", async () => {
      await this.activateView();
    });

    this.addCommand({
      id: "open-accordion-file-view",
      name: "Open Accordion File View",
      callback: async () => {
        await this.activateView();
      },
    });

    this.addSettingTab(new AccordionFileSettingTab(this.app, this));
  }

  onunload(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ACCORDION_FILE).forEach((leaf) => {
      leaf.detach();
    });
  }

  async activateView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ACCORDION_FILE);

    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false) || this.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: VIEW_TYPE_ACCORDION_FILE,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  refreshViews(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ACCORDION_FILE).forEach((leaf) => {
      if (leaf.view instanceof AccordionFileView) {
        void leaf.view.render();
      }
    });
  }
}
