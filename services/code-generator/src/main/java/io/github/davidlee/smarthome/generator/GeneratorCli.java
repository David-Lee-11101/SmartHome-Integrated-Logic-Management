package io.github.davidlee.smarthome.generator;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.Map;

public final class GeneratorCli {
    private GeneratorCli() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 8) {
            System.err.println("usage: GeneratorCli OUTPUT_ROOT PROJECT SERVICE_ID PACKAGE CLASS OPERATION TYPE VALUE");
            System.exit(64);
            return;
        }
        Path outputRoot = Paths.get(args[0]);
        OperationSpec operation = new OperationSpec(args[5], OperationSpec.ValueType.parse(args[6]), args[7]);
        ServiceDefinition definition = new ServiceDefinition(args[2], args[3], args[4], Collections.singletonList(operation));
        GenerationManifest manifest = new GeneratedServiceProjectGenerator(outputRoot).generate(args[1], definition);
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
