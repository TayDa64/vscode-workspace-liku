// src/webview/main.ts

// Define the ConfigProfile interface
interface ConfigProfile {
    id: string;
    name: string;
    description: string;
    icon: string;
    settings: { [key: string]: any };
    extensions: string[];
    files?: Array<{ path: string; content: string }>;
}

// VSCodeWebviewAPI
interface VSCodeWebviewAPI {
    postMessage(message: any): void;
    getState(): any;
    setState(newState: any): void;
}
declare const acquireVsCodeApi: () => VSCodeWebviewAPI;
const vscode = acquireVsCodeApi();

// Type for toolkit elements (a simplified version)
// For full typing, you'd import types from @vscode/webview-ui-toolkit if your bundler is set up for it.
interface VscodeElement extends HTMLElement {
    value: string; // Common property for form-like toolkit elements
    disabled: boolean; // Common property
}
interface VscodeOptionElement extends HTMLElement { // vscode-option
    value: string;
}


document.addEventListener('DOMContentLoaded', () => {
    const searchBar = document.getElementById('search-bar') as HTMLInputElement | null;
    // Use the more specific VscodeElement type for toolkit components
    const profileDropdown = document.getElementById('profile-dropdown') as VscodeElement | null;
    const applyButton = document.getElementById('apply-button') as VscodeElement | null; // vscode-button

    const detailsName = document.getElementById('details-name') as HTMLHeadingElement | null;
    const detailsDescription = document.getElementById('details-description') as HTMLParagraphElement | null;
    const detailsExtensions = document.getElementById('details-extensions') as HTMLUListElement | null;
    const detailsSettings = document.getElementById('details-settings') as HTMLPreElement | null;

    if (!searchBar || !profileDropdown || !applyButton || !detailsName || !detailsDescription || !detailsExtensions || !detailsSettings) {
        vscode.postMessage({ command: 'showError', text: 'Webview UI elements did not load correctly.' });
        console.error("Webview UI elements missing!");
        return;
    }

    let allProfiles: ConfigProfile[] = [];
    let selectedProfile: ConfigProfile | null = null;

    vscode.postMessage({ command: 'getProfiles' });

    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data;
        switch (message.command) {
            case 'profilesLoaded':
                if (message.profiles && Array.isArray(message.profiles)) {
                    allProfiles = message.profiles as ConfigProfile[];
                    populateDropdown(allProfiles);
                }
                break;
        }
    });

    function populateDropdown(profiles: ConfigProfile[]): void {
        if (!profileDropdown) return;

        profileDropdown.innerHTML = '';
        const placeholderOption = document.createElement('vscode-option') as VscodeOptionElement;
        placeholderOption.value = "";
        placeholderOption.textContent = "Select a Profile...";
        profileDropdown.appendChild(placeholderOption);

        profiles.forEach(profile => {
            const option = document.createElement('vscode-option') as VscodeOptionElement;
            option.value = profile.id;
            option.textContent = profile.name;
            profileDropdown.appendChild(option);
        });

        // Resetting the vscode-dropdown's displayed value and internal state
        // Setting 'value' attribute might not always trigger visual update for custom elements.
        // The toolkit components usually manage their state internally.
        // This should select the placeholder:
        profileDropdown.value = "";

        clearDetails();
        if (applyButton) applyButton.disabled = true;
    }

    searchBar.addEventListener('input', (event: Event) => {
        const searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
        const filteredProfiles = allProfiles.filter(profile =>
            profile.name.toLowerCase().includes(searchTerm) ||
            profile.description.toLowerCase().includes(searchTerm)
        );
        populateDropdown(filteredProfiles);
    });

    profileDropdown.addEventListener('change', (event: Event) => {
        // The target of the 'change' event from a vscode-dropdown IS the dropdown itself.
        const targetElement = event.target as VscodeElement;
        const profileId = targetElement.value;
        selectedProfile = allProfiles.find(p => p.id === profileId) || null;

        if (selectedProfile) {
            updateDetails(selectedProfile);
            if (applyButton) applyButton.disabled = false;
        } else {
            clearDetails();
            if (applyButton) applyButton.disabled = true;
        }
    });

    function updateDetails(profile: ConfigProfile): void {
        if (!detailsName || !detailsDescription || !detailsExtensions || !detailsSettings) return;
        detailsName.textContent = profile.name;
        detailsDescription.textContent = profile.description;
        detailsExtensions.innerHTML = profile.extensions.map(ext => `<li>${ext}</li>`).join('');

        const settingsSnippet = Object.entries(profile.settings).slice(0, 5)
                               .reduce((obj, [key, value]) => { obj[key] = value; return obj; }, {} as {[key:string]: any});
        if (Object.keys(profile.settings).length > 5) settingsSnippet["..."] = "(more)";
        detailsSettings.textContent = JSON.stringify(settingsSnippet, null, 2);
    }

    function clearDetails(): void {
        if (!detailsName || !detailsDescription || !detailsExtensions || !detailsSettings) return;
        detailsName.textContent = 'Select a profile';
        detailsDescription.textContent = '';
        detailsExtensions.innerHTML = '';
        detailsSettings.textContent = '';
        selectedProfile = null;
        if(applyButton) applyButton.disabled = true;
    }

    applyButton.addEventListener('click', () => {
        if (selectedProfile) {
            vscode.postMessage({ command: 'applyProfile', profile: selectedProfile });
        }
    });

    clearDetails(); // Initial state
});