// src/webview/main.ts

interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(newState: any): void;
}
declare function acquireVsCodeApi(): VsCodeApi; // VS Code provides this function

interface RecommendedExtensionWeb {
    id: string;
    name?: string; // Name might be optional if only ID is provided by user
}
interface KeySettingWeb {
    key: string;
    value: any;
    description?: string;
}
interface WorkspaceProfileWeb {
    id: string;
    name: string;
    description?: string;
    recommendedExtensions: RecommendedExtensionWeb[];
    keySettingsSnippet: KeySettingWeb[]; // Stored as objects
    isUserDefined?: boolean;
}


(function () {
    const vscode = acquireVsCodeApi();

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
    const deleteCurrentProfileBtn = document.getElementById('deleteCurrentProfileBtn') as HTMLButtonElement;

    // Modal Elements
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
    let builtInProfiles: WorkspaceProfileWeb[] = [];
    let userProfiles: WorkspaceProfileWeb[] = [];
    let currentEditingProfileId: string | null = null;


    // --- Initialization ---
    vscode.postMessage({ command: 'getProfiles' }); // Request profiles on load

    // --- Event Listeners ---
    searchInput.addEventListener('input', () => filterAndDisplayProfiles(searchInput.value));
    profileSelector.addEventListener('change', handleProfileSelectionChange);
    applyButton.addEventListener('click', handleApplyConfiguration);

    createNewProfileBtn.addEventListener('click', () => openEditModal(null)); // null for new profile
    editCurrentProfileBtn.addEventListener('click', () => {
        const selectedId = profileSelector.value;
        const profileToEdit = allProfiles.find(p => p.id === selectedId);
        if (profileToEdit && profileToEdit.isUserDefined) { // Only user-defined can be edited this way
            openEditModal(profileToEdit);
        } else if (profileToEdit && !profileToEdit.isUserDefined) {
             // Option to clone a built-in profile
            const clone = confirm("This is a built-in profile. Do you want to create a new editable copy based on this?");
            if (clone) {
                openEditModal(profileToEdit, true); // true to indicate cloning
            }
        }
    });
    deleteCurrentProfileBtn.addEventListener('click', handleDeleteProfile);

    saveProfileButton.addEventListener('click', handleSaveProfile);
    cancelEditProfileButton.addEventListener('click', closeEditModal);


    // --- Functions ---
    function populateProfileSelector(bProfiles: WorkspaceProfileWeb[], uProfiles: WorkspaceProfileWeb[]) {
        builtInProfiles = bProfiles.map(p => ({ ...p, isUserDefined: false }));
        userProfiles = uProfiles.map(p => ({ ...p, isUserDefined: true }));
        allProfiles = [...builtInProfiles, ...userProfiles];
        filterAndDisplayProfiles(searchInput.value); // Initial population or re-population
    }

    function filterAndDisplayProfiles(searchTerm: string) {
        const previousSelectedValue = profileSelector.value;
        profileSelector.innerHTML = ''; // Clear existing options

        const createOption = (value: string, text: string, disabled: boolean = false) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            option.disabled = disabled;
            return option;
        };
        
        profileSelector.appendChild(createOption("", "-- Select a Profile --"));

        const lowerSearchTerm = searchTerm.toLowerCase();
        const filtered = allProfiles.filter(profile =>
            profile.name.toLowerCase().includes(lowerSearchTerm) ||
            (profile.description && profile.description.toLowerCase().includes(lowerSearchTerm))
        );

        if (builtInProfiles.length > 0 && filtered.some(p => !p.isUserDefined)) {
            const optGroupBuiltIn = document.createElement('optgroup');
            optGroupBuiltIn.label = "Built-in Profiles";
            filtered.filter(p => !p.isUserDefined).forEach(profile => {
                optGroupBuiltIn.appendChild(createOption(profile.id, profile.name));
            });
            profileSelector.appendChild(optGroupBuiltIn);
        }

        if (userProfiles.length > 0 && filtered.some(p => p.isUserDefined)) {
            const optGroupUser = document.createElement('optgroup');
            optGroupUser.label = "User Profiles";
            filtered.filter(p => p.isUserDefined).forEach(profile => {
                optGroupUser.appendChild(createOption(profile.id, profile.name));
            });
            profileSelector.appendChild(optGroupUser);
        }
        
        // Try to re-select the previously selected value if it still exists
        if (previousSelectedValue && Array.from(profileSelector.options).some(opt => opt.value === previousSelectedValue)) {
            profileSelector.value = previousSelectedValue;
        } else {
            profileSelector.value = ""; // Default to "Select a Profile"
        }
        handleProfileSelectionChange(); // Update details based on current selection
    }

    function handleProfileSelectionChange() {
        const selectedProfileId = profileSelector.value;
        const selectedProfile = allProfiles.find(p => p.id === selectedProfileId);

        if (selectedProfile) {
            profileDetailsSection.classList.remove('hidden');
            profileNameEl.textContent = selectedProfile.name;
            profileDescriptionEl.textContent = selectedProfile.description || '';

            recommendedExtensionsListEl.innerHTML = '';
            selectedProfile.recommendedExtensions.forEach(ext => {
                const li = document.createElement('li');
                const name = ext.name ? `${ext.name} (${ext.id})` : ext.id;
                const link = document.createElement('a');
                link.textContent = name;
                link.href = '#';
                link.title = `View ${ext.id} on Marketplace`;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({ command: 'openMarketplacePage', extensionId: ext.id });
                });
                li.appendChild(link);
                recommendedExtensionsListEl.appendChild(li);
            });
            
            const settingsObject: any = {};
            selectedProfile.keySettingsSnippet.forEach(s => {
                settingsObject[s.key] = s.value;
            });
            keySettingsSnippetContentEl.textContent = JSON.stringify(settingsObject, null, 2);

            applyButton.disabled = false;
            editCurrentProfileBtn.disabled = !selectedProfile.isUserDefined && !builtInProfiles.find(p=>p.id === selectedProfile.id); // Can edit user or clone built-in
            deleteCurrentProfileBtn.disabled = !selectedProfile.isUserDefined; // Only user-defined can be deleted
            deleteCurrentProfileBtn.classList.toggle('hidden', !selectedProfile.isUserDefined);
            editCurrentProfileBtn.textContent = selectedProfile.isUserDefined ? "Edit" : "Clone & Edit";

        } else {
            profileDetailsSection.classList.add('hidden');
            applyButton.disabled = true;
            editCurrentProfileBtn.disabled = true;
            deleteCurrentProfileBtn.disabled = true;
        }
    }

    function handleApplyConfiguration() {
        const selectedProfileId = profileSelector.value;
        if (selectedProfileId) {
            vscode.postMessage({ command: 'applyConfiguration', profileId: selectedProfileId });
        }
    }

    function openEditModal(profile: WorkspaceProfileWeb | null, isCloning: boolean = false) {
        currentEditingProfileId = (profile && !isCloning) ? profile.id : null; // If cloning, it's a new profile

        if (profile) {
            modalTitle.textContent = isCloning ? "Clone Profile" : (profile.isUserDefined ? "Edit Profile" : "View Profile");
            editProfileIdInput.value = isCloning ? "" : profile.id; // Clear ID if cloning
            editProfileIdInput.readOnly = !isCloning && !!profile.id; // ID is readonly when editing existing
            editProfileNameInput.value = isCloning ? `${profile.name} (Copy)` : profile.name;
            editProfileDescriptionTextarea.value = profile.description || "";
            
            editRecommendedExtensionsTextarea.value = profile.recommendedExtensions
                .map(ext => ext.name ? `${ext.id},${ext.name}` : ext.id)
                .join('\n');
            
            const settingsObject: any = {};
            profile.keySettingsSnippet.forEach(s => settingsObject[s.key] = s.value);
            editKeySettingsTextarea.value = JSON.stringify(settingsObject, null, 2);

        } else { // New profile
            modalTitle.textContent = "Create New Profile";
            editProfileIdInput.value = "";
            editProfileIdInput.readOnly = false;
            editProfileNameInput.value = "";
            editProfileDescriptionTextarea.value = "";
            editRecommendedExtensionsTextarea.value = "";
            editKeySettingsTextarea.value = "{\n  \n}";
        }
        editProfileModal.classList.remove('hidden');
    }

    function closeEditModal() {
        editProfileModal.classList.add('hidden');
        currentEditingProfileId = null; // Reset
    }

    function handleSaveProfile() {
        const id = editProfileIdInput.value.trim() || editProfileNameInput.value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
        const name = editProfileNameInput.value.trim();
        const description = editProfileDescriptionTextarea.value.trim();

        if (!name) {
            vscode.postMessage({ command: 'showError', text: "Profile Name is required." });
            return;
        }
        if (!id && !currentEditingProfileId) { // If ID is blank for a new profile
             vscode.postMessage({ command: 'showError', text: "Profile ID is required for new profiles if not auto-generated from name." });
            return;
        }


        const rawExtensions = editRecommendedExtensionsTextarea.value.split('\n')
            .map(line => line.trim()).filter(line => line);
        const recommendedExtensions: RecommendedExtensionWeb[] = rawExtensions.map(line => {
            const parts = line.split(',');
            const extId = parts[0].trim();
            const extName = parts.length > 1 ? parts.slice(1).join(',').trim() : undefined;
            return { id: extId, name: extName };
        });

        let keySettingsSnippet: KeySettingWeb[];
        try {
            const settingsObj = JSON.parse(editKeySettingsTextarea.value || "{}");
            keySettingsSnippet = Object.entries(settingsObj).map(([key, value]) => ({ key, value }));
        } catch (e: any) {
            vscode.postMessage({ command: 'showError', text: `Invalid JSON in Key Settings: ${e.message}` });
            return;
        }

        const profileData: WorkspaceProfileWeb = {
            id: currentEditingProfileId || id, // Use existing ID if editing, otherwise new/generated
            name,
            description,
            recommendedExtensions,
            keySettingsSnippet,
            isUserDefined: true
        };

        vscode.postMessage({ command: 'saveUserProfile', profileData });
        // Webview will be updated by 'profilesLoaded' or 'profileSavedOrDeleted' message from extension
    }

    function handleDeleteProfile() {
        const selectedProfileId = profileSelector.value;
        const profileToDelete = userProfiles.find(p => p.id === selectedProfileId); // Can only delete user profiles

        if (profileToDelete && confirm(`Are you sure you want to delete the profile "${profileToDelete.name}"? This cannot be undone.`)) {
            vscode.postMessage({ command: 'deleteUserProfile', profileId: selectedProfileId });
        }
    }

    // Listen for messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'profilesLoaded':
                populateProfileSelector(message.builtInProfiles, message.userProfiles);
                break;
            case 'profileSavedOrDeleted': // After save or delete, close modal and refresh
                closeEditModal();
                // The extension will send 'profilesLoaded' again, so no need to call populate here
                break;
            case 'profileSaveFailed':
                // Optionally, keep modal open and display error near save button
                alert(`Save failed: ${message.message}`); // Simple alert for now
                break;
        }
    });

})();