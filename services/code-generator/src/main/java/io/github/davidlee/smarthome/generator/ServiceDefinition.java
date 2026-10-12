package io.github.davidlee.smarthome.generator;

import java.util.ArrayList;
import java.util.Arrays;
import javax.lang.model.SourceVersion;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public final class ServiceDefinition {
    private static final Pattern SERVICE_ID = Pattern.compile("[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*");
    private static final Pattern PACKAGE_NAME = Pattern.compile("[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+");
    private static final Pattern CLASS_NAME = Pattern.compile("[A-Z][A-Za-z0-9]{0,63}");

    // Names resolved unqualified by both emitted provider templates.
    private static final Set<String> COMMON_TEMPLATE_SYMBOLS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "String", "Exception", "Integer", "Runtime", "Thread", "System", "IllegalArgumentException",
            "TypedValue", "TinyRpcTypedProvider", "TinyRpcServer", "List", "CountDownLatch")));
    private static final Set<String> STATEFUL_TEMPLATE_SYMBOLS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "Object", "Long", "IllegalStateException")));

    public enum Behavior {
        CONSTANT_V1,
        STATEFUL_BOOLEAN_DEVICE_V1;

        public static Behavior parse(String value) {
            if (value == null) throw new IllegalArgumentException("behavior is required");
            try {
                return Behavior.valueOf(value);
            } catch (IllegalArgumentException invalid) {
                throw new IllegalArgumentException("unsupported service behavior", invalid);
            }
        }
    }

    private final String serviceId;
    private final String packageName;
    private final String className;
    private final List<OperationSpec> operations;
    private final Behavior behavior;

    public ServiceDefinition(String serviceId, String packageName, String className, List<OperationSpec> operations) {
        this(serviceId, packageName, className, operations, Behavior.CONSTANT_V1);
    }

    private ServiceDefinition(String serviceId, String packageName, String className,
                              List<OperationSpec> operations, Behavior behavior) {
        if (serviceId == null || serviceId.length() > 128 || !SERVICE_ID.matcher(serviceId).matches()) {
            throw new IllegalArgumentException("serviceId has an invalid format");
        }
        if (packageName == null || packageName.length() > 160 || !PACKAGE_NAME.matcher(packageName).matches()) {
            throw new IllegalArgumentException("packageName has an invalid format");
        }
        for (String segment : packageName.split("\\.")) {
            if (SourceVersion.isKeyword(segment) || "_".equals(segment)) throw new IllegalArgumentException("packageName contains a Java reserved word");
        }
        if (className == null || !CLASS_NAME.matcher(className).matches()) {
            throw new IllegalArgumentException("className has an invalid format");
        }
        if (COMMON_TEMPLATE_SYMBOLS.contains(className)
                || behavior == Behavior.STATEFUL_BOOLEAN_DEVICE_V1 && STATEFUL_TEMPLATE_SYMBOLS.contains(className)) {
            throw new IllegalArgumentException("className conflicts with a type used by the provider template: " + className);
        }
        Objects.requireNonNull(operations, "operations");
        this.behavior = Objects.requireNonNull(behavior, "behavior");
        if (behavior == Behavior.CONSTANT_V1 && (operations.isEmpty() || operations.size() > 32)) {
            throw new IllegalArgumentException("a constant service must contain between 1 and 32 operations");
        }
        if (behavior == Behavior.STATEFUL_BOOLEAN_DEVICE_V1 && !operations.isEmpty()) {
            throw new IllegalArgumentException("stateful behavior has a fixed operation set");
        }
        Set<String> names = new HashSet<>();
        for (OperationSpec operation : operations) {
            if (!names.add(operation.getName())) throw new IllegalArgumentException("duplicate operation: " + operation.getName());
        }
        this.serviceId = serviceId;
        this.packageName = packageName;
        this.className = className;
        this.operations = Collections.unmodifiableList(new ArrayList<>(operations));
    }

    public static ServiceDefinition statefulBooleanDevice(String serviceId, String packageName, String className) {
        return new ServiceDefinition(serviceId, packageName, className, Collections.emptyList(),
                Behavior.STATEFUL_BOOLEAN_DEVICE_V1);
    }

    public String getServiceId() { return serviceId; }
    public String getPackageName() { return packageName; }
    public String getClassName() { return className; }
    public List<OperationSpec> getOperations() { return operations; }
    public Behavior getBehavior() { return behavior; }
}
