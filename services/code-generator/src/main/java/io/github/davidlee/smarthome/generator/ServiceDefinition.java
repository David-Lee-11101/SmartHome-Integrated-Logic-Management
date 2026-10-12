package io.github.davidlee.smarthome.generator;

import java.util.ArrayList;
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

    private final String serviceId;
    private final String packageName;
    private final String className;
    private final List<OperationSpec> operations;

    public ServiceDefinition(String serviceId, String packageName, String className, List<OperationSpec> operations) {
        if (serviceId == null || serviceId.length() > 128 || !SERVICE_ID.matcher(serviceId).matches()) {
            throw new IllegalArgumentException("serviceId has an invalid format");
        }
        if (packageName == null || packageName.length() > 160 || !PACKAGE_NAME.matcher(packageName).matches()) {
            throw new IllegalArgumentException("packageName has an invalid format");
        }
        if (className == null || !CLASS_NAME.matcher(className).matches()) {
            throw new IllegalArgumentException("className has an invalid format");
        }
        Objects.requireNonNull(operations, "operations");
        if (operations.isEmpty() || operations.size() > 32) {
            throw new IllegalArgumentException("a service must contain between 1 and 32 operations");
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

    public String getServiceId() { return serviceId; }
    public String getPackageName() { return packageName; }
    public String getClassName() { return className; }
    public List<OperationSpec> getOperations() { return operations; }
}
