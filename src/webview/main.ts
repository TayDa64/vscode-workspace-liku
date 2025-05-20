// src/webview/main.ts
interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(newState: any): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface RecommendedExtensionWeb { id: string; name?: string; }
interface KeySettingWeb { key: string; value: any; description?: string; }
interface WorkspaceProfileWeb {
    id: string; name: string; description?: string;
    recommendedExtensions: RecommendedExtensionWeb[];
    keySettingsSnippet: KeySettingWeb[];
    isUserDefined?: boolean;
}

(function () {
    const vscode = acquireVsCodeApi();
    const state = vscode.getState() || { selectedProfileId: null }; // Persist selected profile

    // DOM Elements
    const searchInput = document.getElementById('searchConfigurations') as HTMLInputElement;
    const profileSelector = document.getElementById('profileSelector') as HTMLSelectElement;
    const createNewProfileBtn = document.getElementById('createNewProfileBtn') as HTMLButtonElement;
    const profileDetailsSection = document.getElementById('profileDetails') as HTMLDivElement;
    const profileNameEl = document.getElementById('profileName') as HTMLHeadingElement;
    const profileDescriptionEl = document.getElementById('profileDescription') as HTMLParagraphElement;
    const recommendedExtensionsListEl = document.getElementById('recommendedExtensionsList') as HTMLUListElement;
    const keySettingsSnippetContentEl = document.getElementById('keySettingsSnippetContent') as HTMLPreElement;
    const applyButton = document.getElementById('applyConfigurationButton') as HTMLButtonElement;
    const editCurrentProfileBtn = document.getElementById('editCurrentProfileBtn') as HTMLButtonElement;
    const cloneCurrentProfileBtn = document.getElementById('cloneCurrentProfileBtn') as HTMLButtonElement;
    const deleteCurrentProfileBtn = document.getElementById('deleteCurrentProfileBtn') as HTMLButtonElement;
    const editProfileModal = document.getElementById('editProfileModal') as HTMLDivElement;
    const modalTitle = document.getElementById('modalTitle') as HTMLHeadingElement;
    const editProfileIdInput = document.getElementById('editProfileId') as HTMLInputElement;
    const editProfileNameInput = document.getElementById('editProfileName') as HTMLInputElement;
    const editProfileDescriptionTextarea = document.getElementById('editProfileDescription') as HTMLTextAreaElement;
    const editRecommendedExtensionsTextarea = document.getElementById('editRecommendedExtensions') as HTMLTextAreaElement;
    const editKeySettingsTextarea = document.getElementById('editKeySettings') as HTMLTextAreaElement;
    const saveProfileButton = document.getElementById('saveProfileButton') as HTMLButtonElement;
    const cancelEditProfileButton = document.getElementById('cancelEditProfileButton') as HTMLButtonElement;

    let allProfiles: WorkspaceProfileWeb[] = [];
    let userProfiles: WorkspaceProfileWeb[] = []; // Store user profiles for deletion checks
    let currentEditingProfileOriginalId: string | null = null; // Stores the ID of the profile being edited (if it's an existing one)
    let isCloningOperation: boolean = false;

    // --- Initialization ---
    vscode.postMessage({ command: 'getProfiles' });

    // --- Event Listeners ---
    searchInput.addEventListener('input', () => filterAndDisplayProfiles(searchInput.value));
    profileSelector.addEventListener('change', handleProfileSelectionChange);
    applyButton.addEventListener('click', handleApplyConfiguration);
    createNewProfileBtn.addEventListener('click', () => openEditModal(null));
    editCurrentProfileBtn.addEventListener('click', () => {
        const selectedId = profileSelector.value;
        const profile = allProfiles.find(p => p.id === selectedId);
        if (profile) {openEditModal(profile, !profile.isUserDefined);} // Clone if built-in, edit if user-defined
    });
    deleteCurrentProfileBtn.addEventListener('click', handleDeleteProfile);
    saveProfileButton.addEventListener('click', handleSaveProfile);
    cancelEditProfileButton.addEventListener('click', closeEditModal);
    cloneCurrentProfileBtn.addEventListener('click', () => {
        const selectedId = profileSelector.value;
        const profile = allProfiles.find(p => p.id === selectedId);
        if (profile) {openEditModal(profile, true);} // Clone if built-in, edit if user-defined
    });
    // --- Functions ---
    function populateProfileSelectorWithOptions(profilesToDisplay: WorkspaceProfileWeb[]) {
        profileSelector.innerHTML = '<option value="">-- Select a Profile --</option>'; // Clear
        const createOption = (value: string, text: string) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = text; return option;
        };

        const builtIns = profilesToDisplay.filter(p => !p.isUserDefined);
        const userDefs = profilesToDisplay.filter(p => p.isUserDefined);

        if (builtIns.length > 0) {
            const optGroup = document.createElement('optgroup'); optGroup.label = "Built-in Profiles";
            builtIns.forEach(p => optGroup.appendChild(createOption(p.id, p.name)));
            profileSelector.appendChild(optGroup);
        }
        if (userDefs.length > 0) {
            const optGroup = document.createElement('optgroup'); optGroup.label = "User Profiles";
            userDefs.forEach(p => optGroup.appendChild(createOption(p.id, p.name)));
            profileSelector.appendChild(optGroup);
        }
    }
    
    function filterAndDisplayProfiles(searchTerm: string) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        const filtered = allProfiles.filter(p =>
            p.name.toLowerCase().includes(lowerSearchTerm) ||
            (p.description && p.description.toLowerCase().includes(lowerSearchTerm))
        );
        populateProfileSelectorWithOptions(filtered);
        // Try to re-select previous or persisted selection
        if (state.selectedProfileId && filtered.some(p => p.id === state.selectedProfileId)) {
            profileSelector.value = state.selectedProfileId;
        }
        handleProfileSelectionChange(); // Update details based on current (possibly new) selection
    }

    function handleProfileSelectionChange() {
        const selectedProfileId = profileSelector.value;
        state.selectedProfileId = selectedProfileId; // Persist for next time webview opens
        vscode.setState(state);

        const selectedProfile = allProfiles.find(p => p.id === selectedProfileId);
        profileDetailsSection.classList.toggle('hidden', !selectedProfile);
        applyButton.disabled = !selectedProfile;

        if (selectedProfile) {
            profileNameEl.textContent = `${selectedProfile.name} ${selectedProfile.isUserDefined ? '(User)' : '(Built-in)'}`;
            profileDescriptionEl.textContent = selectedProfile.description || '';
            recommendedExtensionsListEl.innerHTML = '';
            selectedProfile.recommendedExtensions.forEach(ext => {
                const li = document.createElement('li');
                const link = document.createElement('a');
                link.textContent = ext.name ? `${ext.name} (${ext.id})` : ext.id;
                link.title = `View ${ext.id} on Marketplace`;
                link.href = "#"; // Prevent page jump
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({ command: 'openMarketplacePage', extensionId: ext.id });
                });
                li.appendChild(link);
                recommendedExtensionsListEl.appendChild(li);
            });
            const settingsObject: any = {};
            selectedProfile.keySettingsSnippet.forEach(s => { settingsObject[s.key] = s.value; });
            keySettingsSnippetContentEl.textContent = JSON.stringify(settingsObject, null, 2);

            editCurrentProfileBtn.textContent = "Edit Profile";
            editCurrentProfileBtn.title = "Edit this user profile";
            editCurrentProfileBtn.classList.toggle('hidden', !selectedProfile.isUserDefined); // Edit only for user
            editCurrentProfileBtn.disabled = !selectedProfile.isUserDefined;
            deleteCurrentProfileBtn.classList.toggle('hidden', !selectedProfile.isUserDefined);
            deleteCurrentProfileBtn.disabled = !selectedProfile.isUserDefined; // Explicitly disable
            cloneCurrentProfileBtn.classList.remove('hidden'); // Clone button always visible if profile selected
            cloneCurrentProfileBtn.disabled = false;
        } else {
            // ...
            editCurrentProfileBtn.classList.add('hidden');
            cloneCurrentProfileBtn.classList.add('hidden');
            deleteCurrentProfileBtn.classList.add('hidden');
            deleteCurrentProfileBtn.disabled = true;
        }
    }

    function handleApplyConfiguration() {
        if (profileSelector.value) {
            vscode.postMessage({ command: 'applyConfiguration', profileId: profileSelector.value });
        }
    }

    function openEditModal(profile: WorkspaceProfileWeb | null, isCloneIntent: boolean = false) {
       // currentEditingProfileOriginalId = (profile && profile.isUserDefined && !isCloneIntent) ? profile.id : null;
        isCloningOperation = !!(isCloneIntent || (profile && !profile.isUserDefined)); // True if cloning or "editing" a built-in

        if (profile && !isCloningOperation && profile.isUserDefined) {
    // This is a direct edit of an existing user profile
           currentEditingProfileOriginalId = profile.id;
           // modalTitle.textContent = isCloningOperation ? `Clone Profile: ${profile.name}` : `Edit Profile: ${profile.name}`;
           // editProfileNameInput.value = isCloningOperation ? `${profile.name} (Copy)` : profile.name;
           // ID field: empty if cloning/new, prefill if editing existing user profile (and make read-only)
           // editProfileIdInput.value = (isCloningOperation || !profile.isUserDefined) ? "" : profile.id;
           // editProfileIdInput.readOnly = !!currentEditingProfileOriginalId; // ReadOnly only if editing an existing user profile
            
            // editProfileDescriptionTextarea.value = profile.description || "";
            // editRecommendedExtensionsTextarea.value = profile.recommendedExtensions
            //     .map(ext => ext.name ? `${ext.id},${ext.name}` : ext.id).join('\n');
            // const settingsObj: any = {};
            // profile.keySettingsSnippet.forEach(s => settingsObj[s.key] = s.value);
            // editKeySettingsTextarea.value = JSON.stringify(settingsObj, null, 2);
         } else {
    // This is either a new profile, or a clone operation (of built-in or user)
            currentEditingProfileOriginalId = null;
        }
        
        // else { // New profile
        //     modalTitle.textContent = "Create New Profile";
        //     currentEditingProfileOriginalId = null; isCloningOperation = false;
        //     [editProfileNameInput, editProfileIdInput, editProfileDescriptionTextarea, editRecommendedExtensionsTextarea]
        //         .forEach(el => el.value = "");
        //     editKeySettingsTextarea.value = "{\n  \n}";
        //     editProfileIdInput.readOnly = false;
        // }
        editProfileModal.classList.remove('hidden');
        editProfileNameInput.focus();
    }

    function closeEditModal() {
        editProfileModal.classList.add('hidden');
        currentEditingProfileOriginalId = null; isCloningOperation = false;
    }

    function handleSaveProfile() {
    const name = editProfileNameInput.value.trim();
    let id = editProfileIdInput.value.trim(); // User-entered ID

    if (!name) { vscode.postMessage({ command: 'showError', text: "Profile Name is required." }); return; }

    // If it's a NEW profile (currentEditingProfileOriginalId is null) AND user left ID blank
    if (!currentEditingProfileOriginalId && !id && name) {
        id = name.toLowerCase()
                 .replace(/\s+/g, '-') // Replace spaces with hyphens
                 .replace(/[^\w.-]/g, ''); // Remove non-alphanumeric (except hyphen, dot)
        if (!id) { // If name resulted in empty ID (e.g. all special chars)
            vscode.postMessage({ command: 'showError', text: "Could not auto-generate ID from name. Please provide a valid ID." });
            return;
        }
        editProfileIdInput.value = id; // Update the input field to show the generated ID
    } else if (!id) { // ID is still blank (e.g. user cleared it, or it's an edit with a blank ID somehow)
        vscode.postMessage({ command: 'showError', text: "Profile ID is required." });
        return;
    }
      // In handleSaveProfile in webview
    if (currentEditingProfileOriginalId && id !== currentEditingProfileOriginalId) {
        vscode.postMessage({ command: 'showError', text: "Profile ID cannot be changed when editing an existing profile." });
        editProfileIdInput.value = currentEditingProfileOriginalId; // Revert
        return;
    }

        const description = editProfileDescriptionTextarea.value.trim();
        const rawExt = editRecommendedExtensionsTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
        // Inside handleSaveProfile, after splitting lines
        const recommendedExtensions: RecommendedExtensionWeb[] = rawExt.map(line => {
        const parts = line.split(',');
        const extId = parts[0].trim();
        if (!extId) { return null; } // Skip if ID is empty after trimming
        const extName = parts.length > 1 ? parts.slice(1).join(',').trim() : undefined;
            return { id: extId, name: extName };
    }).filter(ext => ext !== null && ext.id) as RecommendedExtensionWeb[]; // Filter out nulls and ensure ID

        let keySettingsSnippet: KeySettingWeb[];
        try {
            const settingsObj = JSON.parse(editKeySettingsTextarea.value || "{}");
            keySettingsSnippet = Object.entries(settingsObj).map(([k, v]) => ({ key: k, value: v }));
        } catch (e: any) { vscode.postMessage({ command: 'showError', text: `Invalid JSON in Key Settings: ${e.message}` }); return; }

        const profileData: WorkspaceProfileWeb = {
            id, name, description, recommendedExtensions, keySettingsSnippet, isUserDefined: true
        };
        vscode.postMessage({
            command: 'saveUserProfile',
            profileData,
            isEditing: !!currentEditingProfileOriginalId // True if we were editing an existing user profile
        });
    }

    // Inside handleDeleteProfile()
    function handleDeleteProfile() {
        const selectedId = profileSelector.value;
        // Find from allProfiles to check isUserDefined flag, but delete from userProfiles list conceptually
        const profileToDelete = allProfiles.find(p => p.id === selectedId);

        if (profileToDelete && profileToDelete.isUserDefined) { // Crucial check
            if (confirm(`Are you sure you want to delete the user profile "${profileToDelete.name}"? This cannot be undone.`)) {
                vscode.postMessage({ command: 'deleteUserProfile', profileId: selectedId });
            }
        } else if (profileToDelete && !profileToDelete.isUserDefined) {
            vscode.postMessage({ command: 'showInfo', text: "Built-in profiles cannot be deleted." });
        } else {
            vscode.postMessage({ command: 'showError', text: "No profile selected or profile not found for deletion." });
        }
    }

    // Listen for messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'profilesLoaded':
                allProfiles = [...message.builtInProfiles, ...message.userProfiles]
                                .sort((a,b) => a.name.localeCompare(b.name));
                userProfiles = message.userProfiles; // Keep a separate list for delete checks
                filterAndDisplayProfiles(searchInput.value); // This will repopulate and re-select
                break;
            case 'profileSavedOrDeleted':
                closeEditModal();
                // The extension side should send 'profilesLoaded' again to refresh data fully.
                // If it doesn't, you might need to call vscode.postMessage({ command: 'getProfiles' }); here.
                break;
            case 'profileSaveFailed':
                // Modal likely remains open, error message handled by extension or an alert here.
                // alert(`Profile save failed: ${message.message}`); // Example
                break;
        }
    });

})();