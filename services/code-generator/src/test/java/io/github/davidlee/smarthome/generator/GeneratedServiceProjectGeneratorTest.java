package io.github.davidlee.smarthome.generator;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public class GeneratedServiceProjectGeneratorTest {
    @Rule public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private ServiceDefinition sensor() {
        return new ServiceDefinition("sensor.temperature", "io.smarthome.generated.sensor", "TemperatureSensor",
                Arrays.asList(new OperationSpec("readCelsius", OperationSpec.ValueType.DOUBLE, "21.5")));
    }

    private ServiceDefinition statefulDevice() {
        return ServiceDefinition.statefulBooleanDevice(
                "device.virtual-switch", "io.smarthome.generated.device", "VirtualSwitch");
    }

    @Test public void generatesOnlyManifestedPortableSources() throws Exception {
        Path root = temporaryFolder.newFolder("generated").toPath();
        GenerationManifest manifest = new GeneratedServiceProjectGenerator(root).generate("temperature-sensor", sensor());
        assertEquals("sensor.temperature", manifest.getServiceId());
        assertEquals(3, manifest.getFiles().size());
        assertTrue(Files.isRegularFile(root.resolve("temperature-sensor/pom.xml")));
        assertTrue(Files.isRegularFile(root.resolve("temperature-sensor/src/main/java/io/smarthome/generated/sensor/TemperatureSensor.java")));
        assertTrue(Files.isRegularFile(root.resolve("temperature-sensor/service-descriptor.json")));
        assertFalse(manifest.getFiles().toString().contains(root.toString()));
        String generated = new String(Files.readAllBytes(root.resolve("temperature-sensor/src/main/java/io/smarthome/generated/sensor/TemperatureSensor.java")), java.nio.charset.StandardCharsets.UTF_8);
        String pom = new String(Files.readAllBytes(root.resolve("temperature-sensor/pom.xml")), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(generated.contains("TinyRpcTypedProvider.register"));
        assertTrue(generated.contains("builder.build().bind(\"127.0.0.1\", port)"));
        assertTrue(pom.contains("<groupId>io.smarthome</groupId><artifactId>logic-engine-tiny-rpc-adapter</artifactId>"));
        assertFalse(pom.contains("<groupId>edu."));
    }

    @Test public void statefulTemplateHasFixedTypedContractAndSynchronizedProviderState() throws Exception {
        Path root = temporaryFolder.newFolder("stateful").toPath();
        new GeneratedServiceProjectGenerator(root).generate("virtual-switch", statefulDevice());
        Path project = root.resolve("virtual-switch");
        String generated = new String(Files.readAllBytes(project.resolve("src/main/java/io/smarthome/generated/device/VirtualSwitch.java")), java.nio.charset.StandardCharsets.UTF_8);
        String descriptor = new String(Files.readAllBytes(project.resolve("service-descriptor.json")), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(generated.contains("public boolean setEnabled()"));
        assertTrue(generated.contains("public boolean readEnabled()"));
        assertTrue(generated.contains("public long readActionCount()"));
        assertTrue(generated.contains("synchronized (stateLock)"));
        assertTrue(generated.contains("actionCount == Long.MAX_VALUE"));
        assertTrue(generated.contains("requireNoArguments(values, \"setEnabled\")"));
        assertTrue(descriptor.contains("\"schemaVersion\": \"1.0.1\""));
        assertTrue(descriptor.contains("\"name\": \"setEnabled\""));
        assertTrue(descriptor.contains("\"name\": \"readEnabled\""));
        assertTrue(descriptor.contains("\"name\": \"readActionCount\""));
        assertTrue(descriptor.contains("\"returns\": \"boolean\""));
        assertTrue(descriptor.contains("\"returns\": \"integer\""));
        assertFalse(descriptor.contains("returnFields"));
    }

    @Test public void rejectsTraversalAndInvalidIdentifiers() throws Exception {
        Path root = temporaryFolder.newFolder("invalid").toPath();
        GeneratedServiceProjectGenerator generator = new GeneratedServiceProjectGenerator(root);
        assertThrows(IllegalArgumentException.class, () -> generator.generate("../outside", sensor()));
        assertThrows(IllegalArgumentException.class, () -> new ServiceDefinition("sensor.temperature", "bad-package", "Sensor", Collections.singletonList(new OperationSpec("read", OperationSpec.ValueType.INT, "1"))));
        assertThrows(IllegalArgumentException.class, () -> new OperationSpec("read();", OperationSpec.ValueType.STRING, "value"));
        assertThrows(IllegalArgumentException.class, () -> new OperationSpec("read", OperationSpec.ValueType.DOUBLE, "NaN"));
        assertThrows(IllegalArgumentException.class, () -> ServiceDefinition.Behavior.parse("JAVA"));
        assertThrows(IllegalArgumentException.class, () -> ServiceDefinition.Behavior.parse(null));
    }

    @Test public void rejectsSymlinkRootAndExistingDestination() throws Exception {
        Path parent = temporaryFolder.newFolder("links").toPath();
        Path real = Files.createDirectory(parent.resolve("real"));
        Path link = parent.resolve("link");
        try {
            Files.createSymbolicLink(link, real);
            assertThrows(IllegalArgumentException.class, () -> new GeneratedServiceProjectGenerator(link));
        } catch (UnsupportedOperationException ignored) {
            return;
        }
        GeneratedServiceProjectGenerator generator = new GeneratedServiceProjectGenerator(real);
        Files.createDirectory(real.resolve("temperature-sensor"));
        assertThrows(IllegalArgumentException.class, () -> generator.generate("temperature-sensor", sensor()));
    }

    @Test public void concurrentGenerationHasOneWinnerAndNoPartialFiles() throws Exception {
        Path root = temporaryFolder.newFolder("concurrent").toPath();
        GeneratedServiceProjectGenerator generator = new GeneratedServiceProjectGenerator(root);
        int count = 8;
        ExecutorService executor = Executors.newFixedThreadPool(count);
        CountDownLatch ready = new CountDownLatch(count);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<Boolean>> tasks = new java.util.ArrayList<>();
        for (int index = 0; index < count; index++) tasks.add(() -> {
            ready.countDown(); start.await();
            try { generator.generate("temperature-sensor", sensor()); return true; }
            catch (IllegalArgumentException expected) { return false; }
        });
        List<Future<Boolean>> results = new java.util.ArrayList<>();
        for (Callable<Boolean> task : tasks) results.add(executor.submit(task));
        ready.await();
        start.countDown();
        int winners = 0;
        for (Future<Boolean> result : results) if (result.get()) winners++;
        executor.shutdownNow();
        assertEquals(1, winners);
        try (java.util.stream.Stream<Path> entries = Files.list(root)) {
            assertEquals(0, entries.filter(path -> path.getFileName().toString().startsWith(".temperature-sensor-")).count());
        }
    }

    @Test public void manifestJsonContainsNoHostPath() throws Exception {
        Path root = temporaryFolder.newFolder("manifest").toPath();
        GenerationManifest manifest = new GeneratedServiceProjectGenerator(root).generate("temperature-sensor", sensor());
        String json = GeneratorCli.toJson(manifest);
        assertTrue(json.contains("\"serviceId\":\"sensor.temperature\""));
        assertFalse(json.contains(root.toString()));
    }
}
