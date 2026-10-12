window.getEditorContent = function () {
    const editor = document.getElementById("editor");
    return editor instanceof HTMLTextAreaElement ? editor.value : "";
};

document.getElementById("generate_service_button")?.addEventListener("click", async function () {
    const result = document.getElementById("pipeline_result");
    result.textContent = "Running the local generation pipeline...";
    const value = function (id) { return document.getElementById(id).value; };
    try {
        const proof = await window.management.generateService({
            projectName: value("service_project"),
            serviceId: value("service_id"),
            packageName: value("service_package"),
            className: value("service_class"),
            operation: value("service_operation"),
            valueType: value("service_type"),
            value: value("service_value"),
        });
        result.textContent = JSON.stringify(proof, null, 2);
    } catch (error) {
        result.textContent = `Pipeline failed: ${String(error.message ?? error)}`;
    }
});

const evidenceTargets = {
    logicDefinition: "logic_definition_record",
    profileEvidence: "profile_evidence_record",
    schedulingDecision: "scheduling_decision_record",
    executionEvents: "execution_events_record",
};

async function refreshEvidence() {
    try {
        const snapshot = await window.management.readEvidenceSnapshot();
        for (const [key, targetId] of Object.entries(evidenceTargets)) {
            const target = document.getElementById(targetId);
            const record = snapshot[key];
            target.textContent = record.status === "available"
                ? JSON.stringify(record.value, null, 2)
                : `No local record (${record.fileName}).`;
        }
    } catch (error) {
        for (const targetId of Object.values(evidenceTargets)) {
            document.getElementById(targetId).textContent = `Evidence unavailable: ${String(error.message ?? error)}`;
        }
    }
}

document.getElementById("refresh_evidence_button")?.addEventListener("click", refreshEvidence);
void refreshEvidence();
