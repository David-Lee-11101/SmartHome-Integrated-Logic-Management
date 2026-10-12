package io.github.davidlee.smarthome.generator;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.Map;

public final class GeneratorCli {
    private GeneratorCli() {}

    public static void main(String[] args) throws Exception {
        ServiceDefinition definition;
        int identityOffset;
        if (args.length == 8) {
            identityOffset = 0;
            OperationSpec operation = new OperationSpec(args[5], OperationSpec.ValueType.parse(args[6]), args[7]);
            definition = new ServiceDefinition(args[2], args[3], args[4], Collections.singletonList(operation));
        } else if (args.length == 9 && ServiceDefinition.Behavior.CONSTANT_V1.name().equals(args[0])) {
            identityOffset = 1;
            OperationSpec operation = new OperationSpec(args[6], OperationSpec.ValueType.parse(args[7]), args[8]);
            definition = new ServiceDefinition(args[3], args[4], args[5], Collections.singletonList(operation));
        } else if (args.length == 6 && ServiceDefinition.Behavior.STATEFUL_BOOLEAN_DEVICE_V1.name().equals(args[0])) {
            identityOffset = 1;
            definition = ServiceDefinition.statefulBooleanDevice(args[3], args[4], args[5]);
        } else {
            System.err.println("usage: GeneratorCli [CONSTANT_V1] OUTPUT_ROOT PROJECT SERVICE_ID PACKAGE CLASS OPERATION TYPE VALUE | "
                    + "STATEFUL_BOOLEAN_DEVICE_V1 OUTPUT_ROOT PROJECT SERVICE_ID PACKAGE CLASS");
            System.exit(64);
            return;
        }
        Path outputRoot = Paths.get(args[identityOffset]);
        GenerationManifest manifest = new GeneratedServiceProjectGenerator(outputRoot)
                .generate(args[identityOffset + 1], definition);
        System.out.println(toJson(manifest));
    }

    static String toJson(GenerationManifest manifest) {
        StringBuilder json = new StringBuilder("{");
        json.append("\"schemaVersion\":\"1.0.0\",")
                .append("\"generationId\":\"").append(escape(manifest.getGenerationId())).append("\",")
                .append("\"serviceId\":\"").append(escape(manifest.getServiceId())).append("\",")
                .append("\"templateHash\":\"").append(escape(manifest.getTemplateHash())).append("\",")
                .append("\"files\":{");
        boolean first = true;
        for (Map.Entry<String, String> file : manifest.getFiles().entrySet()) {
            if (!first) json.append(',');
            first = false;
            json.append('\"').append(escape(file.getKey())).append("\":\"").append(escape(file.getValue())).append('\"');
        }
        return json.append("}}" ).toString();
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n");
    }
}
