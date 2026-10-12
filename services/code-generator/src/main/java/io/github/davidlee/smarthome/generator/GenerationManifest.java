package io.github.davidlee.smarthome.generator;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public final class GenerationManifest {
    private final String generationId;
    private final String serviceId;
    private final String templateHash;
    private final Map<String, String> files;

    GenerationManifest(String generationId, String serviceId, String templateHash, Map<String, String> files) {
        this.generationId = generationId;
        this.serviceId = serviceId;
        this.templateHash = templateHash;
        this.files = Collections.unmodifiableMap(new LinkedHashMap<>(files));
    }

    public String getGenerationId() { return generationId; }
    public String getServiceId() { return serviceId; }
    public String getTemplateHash() { return templateHash; }
    public Map<String, String> getFiles() { return files; }
}
