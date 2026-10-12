package io.github.davidlee.smarthome.generator;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import javax.tools.ToolProvider;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import static org.junit.Assert.*;

public class TemplateSymbolNameTest {
    @Rule public TemporaryFolder temporaryFolder = new TemporaryFolder();
    private ServiceDefinition constant(String className) {
        return new ServiceDefinition("sensor.symbol", "io.smarthome.generated.symbol", className,
                Collections.singletonList(new OperationSpec("read", OperationSpec.ValueType.STRING, "example")));
    }

    private void compileActualCollisionProbe(Path root, String className) throws Exception {
        new GeneratedServiceProjectGenerator(root).generate("symbol-service", constant(className));
        String actual = new String(Files.readAllBytes(root.resolve("symbol-service/src/main/java/io/smarthome/generated/symbol/" + className + ".java")), StandardCharsets.UTF_8);
        Matcher field = Pattern.compile("  public static final String SERVICE_ID = [^\\n]+;").matcher(actual);
        Matcher read = Pattern.compile("  public String read\\(\\) \\{ return [^\\n]+; \\}").matcher(actual);
        assertTrue(field.find()); assertTrue(read.find());
        StringBuilder probe = new StringBuilder();
        Path importedType = null;
        if (className.equals("TypedValue")) {
            assertTrue(actual.contains("import io.smarthome.logic.TypedValue;"));
            probe.append("import io.smarthome.logic.TypedValue;\n");
            // This minimal compiler fixture supplies the imported name. The probe
            // tests its collision with the actual top-level provider class name.
            importedType = root.resolve("io/smarthome/logic/TypedValue.java");
            Files.createDirectories(importedType.getParent());
            Files.write(importedType, "package io.smarthome.logic; public final class TypedValue {}\n".getBytes(StandardCharsets.UTF_8));
        }
        assertTrue(actual.contains("  public static void main(String[] args) throws Exception {"));
        probe.append("public final class ").append(className).append(" {\n")
            .append(field.group()).append("\n").append(read.group()).append("\n")
            .append("  public static void main(String[] args) throws Exception {}\n}\n");
        Path source = root.resolve(className + ".java");
        Files.write(source, probe.toString().getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream diagnostics = new ByteArrayOutputStream();
        String[] arguments = importedType == null
            ? new String[]{"-d", root.toString(), source.toString()}
            : new String[]{"-d", root.toString(), importedType.toString(), source.toString()};
        int status = ToolProvider.getSystemJavaCompiler().run(null, null, diagnostics, arguments);
        assertEquals("actual provider fields/return/main signature or import must compile: " + diagnostics.toString("UTF-8"), 0, status);
    }

    private void assertCollisionRejected(String name) throws Exception {
        Path root = temporaryFolder.newFolder(name).toPath();
        try {
            compileActualCollisionProbe(root, name);
            fail("template symbol collision must be rejected before generation");
        } catch (IllegalArgumentException rejected) {
            assertFalse(Files.exists(root.resolve("symbol-service")));
        }
    }

    @Test public void actualStringCollisionIsRejectedBeforeFiles() throws Exception { assertCollisionRejected("String"); }
    @Test public void actualImportedTypedValueCollisionIsRejectedBeforeFiles() throws Exception { assertCollisionRejected("TypedValue"); }

    @Test public void namesAreReservedOnlyWhereTheTemplateUsesThem() throws Exception {
        String[] shared = {"String", "Exception", "Integer", "Runtime", "Thread", "System", "IllegalArgumentException",
            "TypedValue", "TinyRpcTypedProvider", "TinyRpcServer", "List", "CountDownLatch"};
        for (String name : shared) {
            assertThrows(IllegalArgumentException.class, () -> constant(name));
            assertThrows(IllegalArgumentException.class, () -> ServiceDefinition.statefulBooleanDevice("device.switch", "io.smarthome.generated.symbol", name));
        }
        for (String name : new String[]{"Object", "Long", "IllegalStateException"}) {
            assertEquals(name, constant(name).getClassName());
            assertThrows(IllegalArgumentException.class, () -> ServiceDefinition.statefulBooleanDevice("device.switch", "io.smarthome.generated.symbol", name));
            compileActualCollisionProbe(temporaryFolder.newFolder("valid-" + name).toPath(), name);
        }
        for (String name : new String[]{"ValueType", "Boolean", "Double", "StringBuilder", "TemperatureSensor"}) {
            assertEquals(name, constant(name).getClassName());
            assertEquals(name, ServiceDefinition.statefulBooleanDevice("device.switch", "io.smarthome.generated.symbol", name).getClassName());
        }
    }
}
