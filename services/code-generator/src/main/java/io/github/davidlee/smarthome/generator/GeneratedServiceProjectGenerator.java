package io.github.davidlee.smarthome.generator;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public final class GeneratedServiceProjectGenerator {
    private static final Pattern PROJECT_NAME = Pattern.compile("[a-z][a-z0-9-]{0,62}");
    private static final String TEMPLATE_VERSION = "management-provider-v2-stateful-boolean-device";
    private final Path outputRoot;

    public GeneratedServiceProjectGenerator(Path outputRoot) throws IOException {
        if (Files.isSymbolicLink(outputRoot)) throw new IllegalArgumentException("output root cannot be a symbolic link");
        Files.createDirectories(outputRoot);
        if (Files.isSymbolicLink(outputRoot)) throw new IllegalArgumentException("output root cannot be a symbolic link");
        this.outputRoot = outputRoot.toRealPath(LinkOption.NOFOLLOW_LINKS);
    }

    public GenerationManifest generate(String projectName, ServiceDefinition definition) throws IOException {
        if (projectName == null || !PROJECT_NAME.matcher(projectName).matches()) {
            throw new IllegalArgumentException("projectName has an invalid format");
        }
        Path destination = confined(outputRoot.resolve(projectName));
        if (Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) throw new IllegalArgumentException("project already exists");
        Path staging = Files.createTempDirectory(outputRoot, "." + projectName + "-");
        try {
            Map<String, byte[]> rendered = render(definition);
            for (Map.Entry<String, byte[]> file : rendered.entrySet()) {
                Path target = confined(staging.resolve(file.getKey()));
                Files.createDirectories(target.getParent());
                rejectSymlinkSegments(staging, target.getParent());
                Files.write(target, file.getValue());
            }
            try {
                moveReserved(staging, destination);
            } catch (java.nio.file.FileSystemException conflict) {
                throw new IllegalArgumentException("project already exists", conflict);
            }
            staging = null;
            Map<String, String> hashes = new LinkedHashMap<>();
            for (Map.Entry<String, byte[]> file : rendered.entrySet()) hashes.put(file.getKey(), sha256(file.getValue()));
            String templateHash = sha256(TEMPLATE_VERSION.getBytes(StandardCharsets.UTF_8));
            String generationId = sha256((definition.getServiceId() + "\n" + definition.getBehavior().name()
                    + "\n" + templateHash + "\n" + hashes).getBytes(StandardCharsets.UTF_8));
            return new GenerationManifest(generationId, definition.getServiceId(), templateHash, hashes);
        } finally {
            if (staging != null) deleteTree(staging);
        }
    }

    private Map<String, byte[]> render(ServiceDefinition definition) {
        Map<String, byte[]> files = new LinkedHashMap<>();
        String packagePath = definition.getPackageName().replace('.', '/');
        files.put("pom.xml", pom(definition).getBytes(StandardCharsets.UTF_8));
        files.put("service-descriptor.json", serviceDescriptor(definition).getBytes(StandardCharsets.UTF_8));
        files.put("src/main/java/" + packagePath + "/" + definition.getClassName() + ".java",
                source(definition).getBytes(StandardCharsets.UTF_8));
        return files;
    }

    private String pom(ServiceDefinition definition) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<project xmlns=\"http://maven.apache.org/POM/4.0.0\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" "
                + "xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd\">\n"
                + "  <modelVersion>4.0.0</modelVersion>\n"
                + "  <groupId>" + xml(definition.getPackageName()) + "</groupId>\n"
                + "  <artifactId>" + xml(definition.getServiceId().replace('.', '-')) + "</artifactId>\n"
                + "  <version>1.0.0-SNAPSHOT</version>\n"
                + "  <properties><maven.compiler.source>1.8</maven.compiler.source><maven.compiler.target>1.8</maven.compiler.target><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding></properties>\n"
                + "  <dependencies><dependency><groupId>io.smarthome</groupId><artifactId>logic-engine-tiny-rpc-adapter</artifactId><version>1.0-SNAPSHOT</version></dependency></dependencies>\n"
                + "  <build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-dependency-plugin</artifactId><version>3.8.1</version><executions><execution><id>copy-runtime</id><phase>package</phase><goals><goal>copy-dependencies</goal></goals><configuration><includeScope>runtime</includeScope><outputDirectory>${project.build.directory}/dependency</outputDirectory></configuration></execution></executions></plugin></plugins></build>\n"
                + "</project>\n";
    }

    private String source(ServiceDefinition definition) {
        if (definition.getBehavior() == ServiceDefinition.Behavior.STATEFUL_BOOLEAN_DEVICE_V1) {
            return statefulSource(definition);
        }
        return constantSource(definition);
    }

    private String constantSource(ServiceDefinition definition) {
        StringBuilder source = new StringBuilder();
        source.append("package ").append(definition.getPackageName()).append(";\n\n")
                .append("import io.smarthome.logic.TypedValue;\n")
                .append("import io.smarthome.logic.tinyrpc.TinyRpcTypedProvider;\n")
                .append("import io.smarthome.tinyrpc.netty.TinyRpcServer;\n")
                .append("import java.util.List;\n")
                .append("import java.util.concurrent.CountDownLatch;\n\n")
                .append("/** Generated local service implementation. No reuse license is granted. */\n")
                .append("public final class ").append(definition.getClassName()).append(" {\n")
                .append("  public static final String SERVICE_ID = \"").append(javaString(definition.getServiceId())).append("\";\n");
        for (OperationSpec operation : definition.getOperations()) {
            source.append("  public ").append(javaType(operation.getValueType())).append(' ')
                    .append(operation.getName()).append("() { return ")
                    .append(javaLiteral(operation)).append("; }\n");
        }
        source.append("  public static void main(String[] args) throws Exception {\n")
                .append("    int port = args.length == 0 ? 0 : Integer.parseInt(args[0]);\n")
                .append("    ").append(definition.getClassName()).append(" service = new ").append(definition.getClassName()).append("();\n")
                .append("    TinyRpcServer.Builder builder = TinyRpcServer.builder();\n");
        for (OperationSpec operation : definition.getOperations()) {
            source.append("    TinyRpcTypedProvider.register(builder, SERVICE_ID, \"")
                    .append(javaString(operation.getName())).append("\", values -> { requireNoArguments(values, \"")
                    .append(javaString(operation.getName())).append("\"); return ")
                    .append(typedValueExpression("service." + operation.getName() + "()", operation.getValueType())).append("; });\n");
        }
        source.append("    TinyRpcServer server = builder.build().bind(\"127.0.0.1\", port);\n")
                .append("    Runtime.getRuntime().addShutdownHook(new Thread(server::close, \"generated-provider-shutdown\"));\n")
                .append("    System.out.println(\"{\\\"event\\\":\\\"provider-ready\\\",\\\"catalogId\\\":\\\"local.catalog\\\",\\\"host\\\":\\\"127.0.0.1\\\",\\\"port\\\":\" + server.port() + \",\\\"serviceId\\\":\\\"")
                .append(javaString(definition.getServiceId())).append("\\\"}\");\n")
                .append("    System.out.flush();\n")
                .append("    new CountDownLatch(1).await();\n")
                .append("  }\n")
                .append("  private static void requireNoArguments(List<TypedValue> values, String operation) {\n")
                .append("    if (values == null || !values.isEmpty()) throw new IllegalArgumentException(operation + \" does not accept arguments\");\n")
                .append("  }\n");
        return source.append("}\n").toString();
    }

    private String statefulSource(ServiceDefinition definition) {
        return "package " + definition.getPackageName() + ";\n\n"
                + "import io.smarthome.logic.TypedValue;\n"
                + "import io.smarthome.logic.tinyrpc.TinyRpcTypedProvider;\n"
                + "import io.smarthome.tinyrpc.netty.TinyRpcServer;\n"
                + "import java.util.List;\n"
                + "import java.util.concurrent.CountDownLatch;\n\n"
                + "/** Generated stateful local device. No reuse license is granted. */\n"
                + "public final class " + definition.getClassName() + " {\n"
                + "  public static final String SERVICE_ID = \"" + javaString(definition.getServiceId()) + "\";\n"
                + "  private final Object stateLock = new Object();\n"
                + "  private boolean enabled = false;\n"
                + "  private long actionCount = 0L;\n"
                + "  public boolean setEnabled() {\n"
                + "    synchronized (stateLock) {\n"
                + "      if (actionCount == Long.MAX_VALUE) throw new IllegalStateException(\"action count limit reached\");\n"
                + "      enabled = true;\n"
                + "      actionCount++;\n"
                + "      return enabled;\n"
                + "    }\n"
                + "  }\n"
                + "  public boolean readEnabled() { synchronized (stateLock) { return enabled; } }\n"
                + "  public long readActionCount() { synchronized (stateLock) { return actionCount; } }\n"
                + "  public static void main(String[] args) throws Exception {\n"
                + "    int port = args.length == 0 ? 0 : Integer.parseInt(args[0]);\n"
                + "    " + definition.getClassName() + " service = new " + definition.getClassName() + "();\n"
                + "    TinyRpcServer.Builder builder = TinyRpcServer.builder();\n"
                + "    TinyRpcTypedProvider.register(builder, SERVICE_ID, \"setEnabled\", values -> { requireNoArguments(values, \"setEnabled\"); return TypedValue.ofBoolean(service.setEnabled()); });\n"
                + "    TinyRpcTypedProvider.register(builder, SERVICE_ID, \"readEnabled\", values -> { requireNoArguments(values, \"readEnabled\"); return TypedValue.ofBoolean(service.readEnabled()); });\n"
                + "    TinyRpcTypedProvider.register(builder, SERVICE_ID, \"readActionCount\", values -> { requireNoArguments(values, \"readActionCount\"); return TypedValue.ofInteger(service.readActionCount()); });\n"
                + "    TinyRpcServer server = builder.build().bind(\"127.0.0.1\", port);\n"
                + "    Runtime.getRuntime().addShutdownHook(new Thread(server::close, \"generated-provider-shutdown\"));\n"
                + "    System.out.println(\"{\\\"event\\\":\\\"provider-ready\\\",\\\"catalogId\\\":\\\"local.catalog\\\",\\\"host\\\":\\\"127.0.0.1\\\",\\\"port\\\":\" + server.port() + \",\\\"serviceId\\\":\\\""
                + javaString(definition.getServiceId()) + "\\\"}\");\n"
                + "    System.out.flush();\n"
                + "    new CountDownLatch(1).await();\n"
                + "  }\n"
                + "  private static void requireNoArguments(List<TypedValue> values, String operation) {\n"
                + "    if (values == null || !values.isEmpty()) throw new IllegalArgumentException(operation + \" does not accept arguments\");\n"
                + "  }\n"
                + "}\n";
    }

    private String serviceDescriptor(ServiceDefinition definition) {
        StringBuilder json = new StringBuilder();
        json.append("{\n")
                .append("  \"endpoint\": {\"catalogId\": \"local.catalog\"},\n")
                .append("  \"metadata\": {\"capabilityState\": \"experimental\"},\n")
                .append("  \"operations\": [\n");
        if (definition.getBehavior() == ServiceDefinition.Behavior.STATEFUL_BOOLEAN_DEVICE_V1) {
            appendDescriptorOperation(json, "setEnabled", "boolean", false);
            appendDescriptorOperation(json, "readEnabled", "boolean", false);
            appendDescriptorOperation(json, "readActionCount", "integer", true);
        } else {
            for (int index = 0; index < definition.getOperations().size(); index++) {
                OperationSpec operation = definition.getOperations().get(index);
                appendDescriptorOperation(json, operation.getName(), contractType(operation.getValueType()),
                        index == definition.getOperations().size() - 1);
            }
        }
        return json.append("  ],\n")
                .append("  \"schemaVersion\": \"1.0.1\",\n")
                .append("  \"serviceId\": \"").append(javaString(definition.getServiceId())).append("\",\n")
                .append("  \"transport\": {\"kind\": \"tiny-rpc-netty\", \"protocolVersion\": \"1.0.0\"},\n")
                .append("  \"version\": \"1.0.0\"\n")
                .append("}\n").toString();
    }

    private static void appendDescriptorOperation(StringBuilder json, String name, String returns, boolean last) {
        json.append("    {\"name\": \"").append(javaString(name))
                .append("\", \"parameters\": [], \"returns\": \"").append(returns).append("\"}")
                .append(last ? "\n" : ",\n");
    }

    private static String contractType(OperationSpec.ValueType type) {
        switch (type) {
            case BOOLEAN: return "boolean";
            case INT:
            case LONG: return "integer";
            case DOUBLE: return "number";
            case STRING: return "string";
            default: throw new IllegalArgumentException("unsupported value type");
        }
    }

    private static String typedValueExpression(String expression, OperationSpec.ValueType type) {
        switch (type) {
            case BOOLEAN: return "TypedValue.ofBoolean(" + expression + ")";
            case INT: return "TypedValue.ofInteger(" + expression + ")";
            case LONG: return "TypedValue.ofInteger(" + expression + ")";
            case DOUBLE: return "TypedValue.ofNumber(" + expression + ")";
            case STRING: return "TypedValue.ofString(" + expression + ")";
            default: throw new IllegalArgumentException("unsupported value type");
        }
    }

    private static String javaType(OperationSpec.ValueType type) {
        switch (type) {
            case BOOLEAN: return "boolean";
            case INT: return "int";
            case LONG: return "long";
            case DOUBLE: return "double";
            case STRING: return "String";
            default: throw new IllegalArgumentException("unsupported value type");
        }
    }

    private static String javaLiteral(OperationSpec operation) {
        switch (operation.getValueType()) {
            case STRING: return "\"" + javaString(operation.getLiteralValue()) + "\"";
            case LONG: return operation.getLiteralValue() + "L";
            default: return operation.getLiteralValue();
        }
    }

    private Path confined(Path candidate) {
        Path normalized = candidate.toAbsolutePath().normalize();
        if (!normalized.startsWith(outputRoot)) throw new IllegalArgumentException("path escapes output root");
        return normalized;
    }

    private static void rejectSymlinkSegments(Path root, Path candidate) throws IOException {
        Path current = root;
        for (Path segment : root.relativize(candidate)) {
            current = current.resolve(segment);
            if (Files.isSymbolicLink(current)) throw new IllegalArgumentException("symbolic link path segment rejected");
        }
    }

    private static void moveReserved(Path source, Path destination) throws IOException {
        try {
            Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException unsupported) {
            Files.move(source, destination);
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) return;
        List<Path> paths = new ArrayList<>();
        Files.walk(root).forEach(paths::add);
        paths.sort(Comparator.reverseOrder());
        for (Path path : paths) Files.deleteIfExists(path);
    }

    private static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder value = new StringBuilder();
            for (byte item : digest) value.append(String.format("%02x", item));
            return value.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static String javaString(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n");
    }

    private static String xml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
    }
}
