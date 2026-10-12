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

public class ObjectOperationSignatureTest {
    @Rule public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private static String value(OperationSpec.ValueType type) {
        if (type == OperationSpec.ValueType.BOOLEAN) return "true";
        if (type == OperationSpec.ValueType.STRING) return "example";
        return "1";
    }

    private void assertGeneratedMethodCompiles(Path root, String name, OperationSpec.ValueType type) throws Exception {
        ServiceDefinition definition = new ServiceDefinition("sensor.signature", "io.smarthome.generated.signature", "SignatureService",
                Collections.singletonList(new OperationSpec(name, type, value(type))));
        new GeneratedServiceProjectGenerator(root).generate("signature-service", definition);
        String generated = new String(Files.readAllBytes(root.resolve("signature-service/src/main/java/io/smarthome/generated/signature/SignatureService.java")), StandardCharsets.UTF_8);
        // Compile the actual emitted constant method in an Object subclass. The
        // transport startup code is outside this Java inheritance boundary test.
        Matcher method = Pattern.compile("  public [^\\n]+ " + Pattern.quote(name) + "\\(\\) \\{ return [^\\n]+; \\}").matcher(generated);
        assertTrue("actual generated operation method is absent", method.find());
        Path probe = root.resolve("SignatureProbe.java");
        Files.write(probe, ("public class SignatureProbe {\n" + method.group() + "\n}\n").getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream diagnostics = new ByteArrayOutputStream();
        assertNotNull("the generator requires a JDK", ToolProvider.getSystemJavaCompiler());
        int status = ToolProvider.getSystemJavaCompiler().run(null, null, diagnostics, "-d", root.toString(), probe.toString());
        assertEquals("actual generated signature must compile or be rejected before generation: " + diagnostics.toString("UTF-8"), 0, status);
    }

    @Test public void incompatibleInheritedMethodsFailBeforePublication() throws Exception {
        String[] names = {"getClass", "notify", "notifyAll", "wait", "finalize", "toString", "hashCode", "clone"};
        int caseNumber = 0;
        for (String name : names) {
            for (OperationSpec.ValueType type : OperationSpec.ValueType.values()) {
                if ((name.equals("toString") || name.equals("clone")) && type == OperationSpec.ValueType.STRING
                        || name.equals("hashCode") && type == OperationSpec.ValueType.INT) continue;
                Path root = temporaryFolder.newFolder("invalid-" + caseNumber++).toPath();
                try {
                    assertGeneratedMethodCompiles(root, name, type);
                    fail("incompatible inherited signature must be rejected");
                } catch (IllegalArgumentException rejected) {
                    assertFalse("rejection must precede any published project", Files.exists(root.resolve("signature-service")));
                }
            }
        }
    }

    @Test public void validOverridesAndNonconflictingOverloadsRemainCompilable() throws Exception {
        assertGeneratedMethodCompiles(temporaryFolder.newFolder("string-override").toPath(), "toString", OperationSpec.ValueType.STRING);
        assertGeneratedMethodCompiles(temporaryFolder.newFolder("int-override").toPath(), "hashCode", OperationSpec.ValueType.INT);
        assertGeneratedMethodCompiles(temporaryFolder.newFolder("covariant-override").toPath(), "clone", OperationSpec.ValueType.STRING);
        assertGeneratedMethodCompiles(temporaryFolder.newFolder("noarg-overload").toPath(), "equals", OperationSpec.ValueType.BOOLEAN);
    }
}
