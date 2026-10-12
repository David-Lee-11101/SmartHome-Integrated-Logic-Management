import {contextBridge, ipcRenderer} from "electron";

contextBridge.exposeInMainWorld("management", {
    status: "ready",
    generateService: (request: unknown) => ipcRenderer.invoke("management:generate-service", request),
    readEvidenceSnapshot: () => ipcRenderer.invoke("management:evidence-snapshot"),
});
ipcRenderer.send("management:preload-ready");

//规定了逻辑处理函数与页面元素变化时接收通知并处理

//这个函数用来生成下拉列表中的每一项（对应其显示文本与真实值）
function refreshSelect(elem: HTMLSelectElement, selectDict: object) {
    elem.innerHTML = "";
    for (let item of Object.values(selectDict)) {
        let option = document.createElement("option");
        option.value = item["module_name"];
        option.text = item["name"];
        elem.add(option);
    }
    if (elem.options.length === 0) {
        let option = document.createElement("option");
        option.value = "";
        option.text = "No local catalog entries";
        option.disabled = true;
        option.selected = true;
        elem.add(option);
    }
}

function refreshDACSelect(elem: HTMLSelectElement, selectDict: object) {
    elem.innerHTML = "";
    let optionsAdded = false; // 用于跟踪是否已经添加了选项

    for (let item of Object.values(selectDict)[0]["live_channels"]) {
        if (item["offline"] != "true") {
            let option = document.createElement("option");
            option.value = item["id"];
            option.text = item["user_name_field"];
            elem.add(option);
            optionsAdded = true;
        }
    }
    if (!optionsAdded) {
        let option = document.createElement("option");
        option.value = "no_DAC_data";
        option.text = "No bounded account";
        elem.add(option);
    }
}

// 需要在这里加上数目动态变化的输入框（因为action fields里面数量是变化的）
function refreshDSNSelect(elem: HTMLSelectElement, json_dict: object, select_account: string) {
    elem.innerHTML = "";
    let optionsAdded = false; // 用于跟踪是否已经添加了选项

    for (let item of Object.values(json_dict)[0]["live_channels"]) {
        if (item["id"] == select_account) {
            for (let mac of item["macaddress"]) {
                let option = document.createElement("option");
                option.value = mac["value"];
                option.text = mac["label"];
                elem.add(option);
                optionsAdded = true;
            }
        }
    }
    if (!optionsAdded) {
        let option = document.createElement("option");
        option.value = "no_DSN_data";
        option.text = "No bounded device";
        elem.add(option);
    }
}


function refreshDeviceInfoSelect(elem: HTMLSelectElement, value_json_dict: object) {
    elem.innerHTML = "";
    let optionsAdded = false; // 用于跟踪是否已经添加了选项

    for (let item of Object.values(value_json_dict)) {
        let option = document.createElement("option");
        option.value = item["value"];
        option.text = item["label"];
        elem.add(option);
        optionsAdded = true;
    }
    if (!optionsAdded) {
        let option = document.createElement("option");
        option.value = "no_info";
        option.text = "No bounded info";
        elem.add(option);
    }
}

async function getAllSelects() {
    let trigger_device = document.getElementById(
        "trigger_device"
    ) as HTMLSelectElement;
    let trigger_condition = document.getElementById(
        "trigger_condition"
    ) as HTMLSelectElement;
    let trigger_DAC = document.getElementById(
        "trigger_DAC"
    ) as HTMLSelectElement;
    const dynamic_trigger_device_info: { label: string, selectedValue: string }[] = [];
    const dynamic_trigger = document.querySelectorAll(".dynamic-trigger-select-style") as NodeListOf<HTMLSelectElement>;
    dynamic_trigger.forEach((select) => {
        const label = select.previousElementSibling.textContent; // 获取标签文本
        const selectedValue = select.value; // 获取当前选择的值
        dynamic_trigger_device_info.push({label, selectedValue});
    });


    let query_device = document.getElementById(
        "query_device"
    ) as HTMLSelectElement;
    let query_content = document.getElementById(
        "query_content"
    ) as HTMLSelectElement;
    let query_DAC = document.getElementById(
        "query_DAC"
    ) as HTMLSelectElement;
    const dynamic_query_device_info: { label: string, selectedValue: string }[] = [];
    const dynamic_query = document.querySelectorAll(".dynamic-query-select-style") as NodeListOf<HTMLSelectElement>;
    dynamic_query.forEach((select) => {
        const label = select.previousElementSibling.textContent; // 获取标签文本
        const selectedValue = select.value; // 获取当前选择的值
        dynamic_query_device_info.push({label, selectedValue});
    });

    let action_device = document.getElementById(
        "action_device"
    ) as HTMLSelectElement;
    let action_execution = document.getElementById(
        "action_execution"
    ) as HTMLSelectElement;
    let action_DAC = document.getElementById(
        "action_DAC"
    ) as HTMLSelectElement;
    const dynamic_action_device_info: { label: string, selectedValue: string }[] = [];
    const dynamic_action = document.querySelectorAll(".dynamic-action-select-style") as NodeListOf<HTMLSelectElement>;
    dynamic_action.forEach((select) => {
        const label = select.previousElementSibling.textContent; // 获取标签文本
        const selectedValue = select.value; // 获取当前选择的值
        dynamic_action_device_info.push({label, selectedValue});
    });

    let filter_code = await ipcRenderer.invoke('getEditorContent').then((content) => {
        return String(content)
    });
    let rule_name = document.getElementById("rule_name_input") as HTMLInputElement;
    let is_pro = document.getElementById("pro_chk") as HTMLInputElement;
    let priority = document.getElementById("priority") as HTMLSelectElement;

    return {
        trigger_device: trigger_device.options[trigger_device.selectedIndex].value,
        trigger_condition: trigger_condition.options[trigger_condition.selectedIndex].value,
        trigger_DAC: trigger_DAC.options[trigger_DAC.selectedIndex].value,
        trigger_device_info: dynamic_trigger_device_info,

        query_device: query_device.options[query_device.selectedIndex].value,
        query_content: query_content.options[query_content.selectedIndex].value,
        query_DAC: query_DAC.options[query_DAC.selectedIndex].value,
        query_device_info: dynamic_query_device_info,

        action_device: action_device.options[action_device.selectedIndex].value,
        action_execution: action_execution.options[action_execution.selectedIndex].value,
        action_DAC: action_DAC.options[action_DAC.selectedIndex].value,
        action_device_info: dynamic_action_device_info,

        filter_code: filter_code,

        is_pro: is_pro.checked,
        priority: priority.options[priority.selectedIndex].text,
        rule_name: rule_name.value,
    };
}

window.addEventListener("load", () => {
    ipcRenderer.send("refresh_button_click");
});

window.onload = () => {
    ipcRenderer.on("load_trigger_devices", (event, arg) => {
        let trigger_device_elem = document.getElementById(
            "trigger_device"
        ) as HTMLSelectElement;
        refreshSelect(trigger_device_elem, arg);
        if (Object.keys(arg).length > 0) ipcRenderer.send("trigger_device_change", trigger_device_elem.options[0].text);
    });

    ipcRenderer.on("load_query_devices", (event, arg) => {
        let query_device_elem = document.getElementById(
            "query_device"
        ) as HTMLSelectElement;
        refreshSelect(query_device_elem, arg);
        if (Object.keys(arg).length > 0) ipcRenderer.send("query_device_change", query_device_elem.options[0].text);
    });

    ipcRenderer.on("load_action_devices", (event, arg) => {
        let action_device_elem = document.getElementById(
            "action_device"
        ) as HTMLSelectElement;
        refreshSelect(action_device_elem, arg);
        if (Object.keys(arg).length > 0) ipcRenderer.send("action_device_change", action_device_elem.options[0].text);
    });


    document.getElementById("start_button")?.addEventListener("click", async () => {
        let allSelects = await getAllSelects();
        ipcRenderer.send("start_button_click", allSelects);
    });
    document.getElementById("refresh_button")?.addEventListener("click", () => {
        ipcRenderer.send("refresh_button_click");
    });
    document.getElementById("refresh_options")?.addEventListener("click", async () => {
        let allSelects = await getAllSelects();
        ipcRenderer.send("load_filter_code_option", allSelects);
    });


    document.getElementById("trigger_device")?.addEventListener("change", () => {
        let trigger_device = document.getElementById(
            "trigger_device"
        ) as HTMLSelectElement;
        let select_trigger =
            trigger_device.options[trigger_device.selectedIndex].text;
        ipcRenderer.send("trigger_device_change", select_trigger);
    });
    document.getElementById("query_device")?.addEventListener("change", () => {
        let query_device = document.getElementById(
            "query_device"
        ) as HTMLSelectElement;
        let select_content =
            query_device.options[query_device.selectedIndex].text;
        ipcRenderer.send("query_device_change", select_content);
    });
    document.getElementById("action_device")?.addEventListener("change", () => {
        let action_device = document.getElementById(
            "action_device"
        ) as HTMLSelectElement;
        let select_content =
            action_device.options[action_device.selectedIndex].text;
        ipcRenderer.send("action_device_change", select_content);
    });

    document.getElementById("trigger_condition")?.addEventListener("change", () => {
        let trigger_device = document.getElementById(
            "trigger_device"
        ) as HTMLSelectElement;
        let trigger_condition = document.getElementById(
            "trigger_condition") as HTMLSelectElement;
        let trigger_DAC = document.getElementById(
            "trigger_DAC"
        ) as HTMLSelectElement;

        let select_trigger =
            trigger_device.options[trigger_device.selectedIndex].value;
        let select_trigger_condition =
            trigger_condition.options[trigger_condition.selectedIndex].value;
        let select_account =
            trigger_DAC.options[trigger_DAC.selectedIndex].value;
        ipcRenderer.send("trigger_condition_change", select_trigger, select_trigger_condition, select_account);
    });

    document.getElementById("query_content")?.addEventListener("change", () => {
        let query_device = document.getElementById(
            "query_device"
        ) as HTMLSelectElement;
        let query_content = document.getElementById(
            "query_content") as HTMLSelectElement;
        let query_DAC = document.getElementById(
            "query_DAC"
        ) as HTMLSelectElement;

        let select_query =
            query_device.options[query_device.selectedIndex].value;
        let select_query_content =
            query_content.options[query_content.selectedIndex].value;
        let select_account =
            query_DAC.options[query_DAC.selectedIndex].value;
        ipcRenderer.send("query_content_change", select_query, select_query_content, select_account);
    });

    document.getElementById("action_execution")?.addEventListener("change", () => {
        let action_device = document.getElementById(
            "action_device"
        ) as HTMLSelectElement;
        let action_execution = document.getElementById(
            "action_execution") as HTMLSelectElement;
        let action_DAC = document.getElementById(
            "action_DAC"
        ) as HTMLSelectElement;

        let select_action =
            action_device.options[action_device.selectedIndex].value;
        let select_action_execution =
            action_execution.options[action_execution.selectedIndex].value;
        let select_account =
            action_DAC.options[action_DAC.selectedIndex].value;
        ipcRenderer.send("action_execution_change", select_action, select_action_execution, select_account);
    });


    document.getElementById("trigger_DAC")?.addEventListener("change", () => {
        let trigger_device = document.getElementById(
            "trigger_device"
        ) as HTMLSelectElement;
        let trigger_condition = document.getElementById(
            "trigger_condition"
        ) as HTMLSelectElement;
        let trigger_DAC = document.getElementById(
            "trigger_DAC"
        ) as HTMLSelectElement;

        let select_trigger =
            trigger_device.options[trigger_device.selectedIndex].value;
        let select_trigger_condition =
            trigger_condition.options[trigger_condition.selectedIndex].value;
        let select_account =
            trigger_DAC.options[trigger_DAC.selectedIndex].value;
        ipcRenderer.send("trigger_DAC_change", select_trigger, select_trigger_condition, select_account);
    });

    document.getElementById("query_DAC")?.addEventListener("change", () => {
        let query_device = document.getElementById(
            "query_device"
        ) as HTMLSelectElement;
        let query_content = document.getElementById(
            "query_content"
        ) as HTMLSelectElement;
        let query_DAC = document.getElementById(
            "query_DAC"
        ) as HTMLSelectElement;

        let select_query =
            query_device.options[query_device.selectedIndex].value;
        let select_query_content =
            query_content.options[query_content.selectedIndex].value;
        let select_account =
            query_DAC.options[query_DAC.selectedIndex].value;
        ipcRenderer.send("query_DAC_change", select_query, select_query_content, select_account);
    });

    document.getElementById("action_DAC")?.addEventListener("change", () => {
        let action_device = document.getElementById(
            "action_device"
        ) as HTMLSelectElement;
        let action_execution = document.getElementById(
            "action_execution") as HTMLSelectElement;
        let action_DAC = document.getElementById(
            "action_DAC"
        ) as HTMLSelectElement;

        let select_action =
            action_device.options[action_device.selectedIndex].value;
        let select_action_execution =
            action_execution.options[action_execution.selectedIndex].value;
        let select_account =
            action_DAC.options[action_DAC.selectedIndex].value;
        ipcRenderer.send("action_DAC_change", select_action, select_action_execution, select_account);
    });


    //根据Trigger Device选项的变化来更新对应的Trigger Condition列表，同时也会更新Device_Account（即设为默认的第一个）
    ipcRenderer.on("update-trigger-condition", (event, arg) => {
        let trigger_condition_elem = document.getElementById(
            "trigger_condition"
        ) as HTMLSelectElement;
        refreshSelect(trigger_condition_elem, arg);
        let trigger_DAC_elem = document.getElementById(
            "trigger_DAC"
        ) as HTMLSelectElement;
        refreshDACSelect(trigger_DAC_elem, arg);

        //注意，你必须要在Trigger_Device使得condition和account更新完了后才可以发送更新device_name的请求
        let trigger_device = document.getElementById(
            "trigger_device"
        ) as HTMLSelectElement;
        let select_trigger_value =
            trigger_device.options[trigger_device.selectedIndex].value;
        let trigger_condition = document.getElementById(
            "trigger_condition"
        ) as HTMLSelectElement;
        let select_trigger_condition =
            trigger_condition.options[trigger_condition.selectedIndex].value;
        let trigger_DAC = document.getElementById(
            "trigger_DAC"
        ) as HTMLSelectElement;
        let select_account =
            trigger_DAC.options[trigger_DAC.selectedIndex].value;
        ipcRenderer.send("trigger_DAC_change", select_trigger_value, select_trigger_condition, select_account);
    });

    ipcRenderer.on("update-query-content", (event, arg) => {
        let query_content_elem = document.getElementById(
            "query_content"
        ) as HTMLSelectElement;
        refreshSelect(query_content_elem, arg);
        let query_DAC_elem = document.getElementById(
            "query_DAC"
        ) as HTMLSelectElement;
        refreshDACSelect(query_DAC_elem, arg)

        let query_device = document.getElementById(
            "query_device"
        ) as HTMLSelectElement;
        let select_query_value =
            query_device.options[query_device.selectedIndex].value;
        let query_content = document.getElementById(
            "query_content"
        ) as HTMLSelectElement;
        let select_query_content =
            query_content.options[query_content.selectedIndex].value;
        let query_DAC = document.getElementById(
            "query_DAC"
        ) as HTMLSelectElement;
        let select_account =
            query_DAC.options[query_DAC.selectedIndex].value;
        ipcRenderer.send("query_DAC_change", select_query_value, select_query_content, select_account);
    });

    //根据Action Device的变化来更新Action Execution
    ipcRenderer.on("update-action-execution", (event, arg) => {
        let action_execution_elem = document.getElementById(
            "action_execution"
        ) as HTMLSelectElement;
        refreshSelect(action_execution_elem, arg);
        let action_DAC_elem = document.getElementById(
            "action_DAC"
        ) as HTMLSelectElement;
        refreshDACSelect(action_DAC_elem, arg)

        let action_device = document.getElementById(
            "action_device"
        ) as HTMLSelectElement;
        let select_action_value =
            action_device.options[action_device.selectedIndex].value;
        let action_execution = document.getElementById(
            "action_execution"
        ) as HTMLSelectElement;
        let select_action_execution =
            action_execution.options[action_execution.selectedIndex].value;
        let action_DAC = document.getElementById(
            "action_DAC"
        ) as HTMLSelectElement;
        let select_account =
            action_DAC.options[action_DAC.selectedIndex].value;
        ipcRenderer.send("action_DAC_change", select_action_value, select_action_execution, select_account);
    });

    ipcRenderer.on("update-trigger-device-info", (event, trigger_json: object, select_trigger_condition: string, select_account: string) => {
        for (let item of Object.values(trigger_json)) {
            if (item["module_name"] == select_trigger_condition) {
                let trigger_fields_num = item["trigger_fields_num"];
                let live_channel_exist = false;
                let parentDiv = document.getElementById("trigger_dynamic_device_info_select");
                for (let channel of Object.values(item["live_channels"])) {
                    // @ts-ignore
                    if (channel["id"] == select_account) {
                        live_channel_exist = true;
                        parentDiv.innerHTML = ""; // 清空容器的内容
                        for (let i = 3; i < 3 + trigger_fields_num; i++) {
                            let key = Object.keys(channel)[i];
                            // @ts-ignore
                            let value = channel[key];
                            let labelElement = document.createElement("label");
                            labelElement.textContent = key;
                            labelElement.classList.add("label-style");
                            let selectElement = document.createElement("select");
                            selectElement.id = key;
                            selectElement.classList.add("dynamic-trigger-select-style");

                            let defaultOption = document.createElement("option");
                            defaultOption.value = "";
                            defaultOption.text = "Select Trigger Device Info";
                            selectElement.appendChild(defaultOption);

                            parentDiv.appendChild(labelElement);
                            parentDiv.appendChild(selectElement);
                            refreshDeviceInfoSelect(selectElement, value);
                        }
                    }
                }
                if (!live_channel_exist) {
                    parentDiv.innerHTML = ""; // 清空容器的内容
                    for (let trigger_fields_item of Object.values(item["trigger_fields"])) {
                        let labelElement = document.createElement("label");
                        // @ts-ignore
                        labelElement.textContent = trigger_fields_item["name"];
                        labelElement.classList.add("label-style");
                        let selectElement = document.createElement("select");
                        // @ts-ignore
                        selectElement.id = trigger_fields_item["name"];
                        selectElement.classList.add("dynamic-trigger-select-style");

                        let defaultOption = document.createElement("option");
                        defaultOption.value = "";
                        defaultOption.text = "No bounded info";
                        selectElement.appendChild(defaultOption);
                        parentDiv.appendChild(labelElement);
                        parentDiv.appendChild(selectElement);
                    }
                }
            }
        }
    });

    ipcRenderer.on("update-query-device-info", (event, query_json: object, select_query_content: string, select_account: string) => {
        for (let item of Object.values(query_json)) {
            if (item["module_name"] == select_query_content) {
                let query_fields_num = item["query_fields_num"];
                let parentDiv = document.getElementById("query_dynamic_device_info_select");
                let live_channel_exist = false;
                for (let channel of Object.values(item["live_channels"])) {
                    // @ts-ignore
                    if (channel["id"] == select_account) {
                        live_channel_exist = true;
                        parentDiv.innerHTML = ""; // 清空容器的内容
                        for (let i = 3; i < 3 + query_fields_num; i++) {
                            let key = Object.keys(channel)[i];
                            // @ts-ignore
                            let value = channel[key];
                            let labelElement = document.createElement("label");
                            labelElement.textContent = key;
                            labelElement.classList.add("label-style");
                            let selectElement = document.createElement("select");
                            selectElement.id = key;
                            selectElement.classList.add("dynamic-query-select-style");

                            let defaultOption = document.createElement("option");
                            defaultOption.value = "";
                            defaultOption.text = "Select Query Device Info";
                            selectElement.appendChild(defaultOption);

                            parentDiv.appendChild(labelElement);
                            parentDiv.appendChild(selectElement);
                            refreshDeviceInfoSelect(selectElement, value);
                        }
                    }
                }
                if (!live_channel_exist) {
                    parentDiv.innerHTML = ""; // 清空容器的内容
                    for (let query_fields_item of Object.values(item["query_fields"])) {
                        let labelElement = document.createElement("label");
                        // @ts-ignore
                        labelElement.textContent = query_fields_item["name"];
                        labelElement.classList.add("label-style");
                        let selectElement = document.createElement("select");
                        // @ts-ignore
                        selectElement.id = query_fields_item["name"];
                        selectElement.classList.add("dynamic-query-select-style");

                        let defaultOption = document.createElement("option");
                        defaultOption.value = "";
                        defaultOption.text = "No bounded info";
                        selectElement.appendChild(defaultOption);
                        parentDiv.appendChild(labelElement);
                        parentDiv.appendChild(selectElement);
                    }
                }
            }
        }
    });

    ipcRenderer.on("update-action-device-info", (event, action_json: object, select_action_execution: string, select_account: string) => {
        for (let item of Object.values(action_json)) {
            if (item["module_name"] == select_action_execution) {
                let action_fields_num = item["action_fields_num"];
                let parentDiv = document.getElementById("action_dynamic_device_info_select");
                let live_channel_exist = false;
                for (let channel of Object.values(item["live_channels"])) {
                    // @ts-ignore
                    if (channel["id"] == select_account) {
                        live_channel_exist = true;
                        parentDiv.innerHTML = ""; // 清空容器的内容
                        for (let i = 3; i < 3 + action_fields_num; i++) {
                            let key = Object.keys(channel)[i];
                            // @ts-ignore
                            let value = channel[key];
                            let labelElement = document.createElement("label");
                            labelElement.textContent = key;
                            labelElement.classList.add("label-style");
                            let selectElement = document.createElement("select");
                            selectElement.id = key;
                            selectElement.classList.add("dynamic-action-select-style");

                            let defaultOption = document.createElement("option");
                            defaultOption.value = "";
                            defaultOption.text = "Select Action Device Info";
                            selectElement.appendChild(defaultOption);

                            parentDiv.appendChild(labelElement);
                            parentDiv.appendChild(selectElement);
                            refreshDeviceInfoSelect(selectElement, value);
                        }
                    }
                }
                if (!live_channel_exist) {
                    parentDiv.innerHTML = ""; // 清空容器的内容
                    for (let action_fields_item of Object.values(item["action_fields"])) {
                        let labelElement = document.createElement("label");
                        // @ts-ignore
                        labelElement.textContent = action_fields_item["name"];
                        labelElement.classList.add("label-style");
                        let selectElement = document.createElement("select");
                        // @ts-ignore
                        selectElement.id = action_fields_item["name"];
                        selectElement.classList.add("dynamic-action-select-style");

                        let defaultOption = document.createElement("option");
                        defaultOption.value = "";
                        defaultOption.text = "No bounded info";
                        selectElement.appendChild(defaultOption);
                        parentDiv.appendChild(labelElement);
                        parentDiv.appendChild(selectElement);
                    }
                }
            }
        }
    });

    ipcRenderer.on("update_filter_trigger_ingredient", (event, arg) => {
        let filter_trigger_ingredient_elem = document.getElementById(
            "filter_trigger_ingredient"
        ) as HTMLSelectElement;
        filter_trigger_ingredient_elem.innerHTML = "";
        for(let item of arg) {
            let option = document.createElement("option");
            option.value = item;
            option.text = item;
            filter_trigger_ingredient_elem.add(option);
        }
    });

    document.getElementById('copy_filter_trigger_ingredient')!.addEventListener('click', async () => {
        const filter_trigger_ingredient = document.getElementById(
            "filter_trigger_ingredient"
        ) as HTMLSelectElement;;
        try {
          await navigator.clipboard.writeText(filter_trigger_ingredient.options[filter_trigger_ingredient.selectedIndex].value);
        } catch (err) {
        }
    });

    ipcRenderer.on("update_filter_action_options", (event, arg) => {
        let filter_action_option_elem = document.getElementById(
            "filter_action_option"
        ) as HTMLSelectElement;
        filter_action_option_elem.innerHTML = "";
        for(let item of arg) {
            let option = document.createElement("option");
            option.value = item;
            option.text = item;
            filter_action_option_elem.add(option);
        }
    });

    document.getElementById('copy_filter_action_option')!.addEventListener('click', async () => {
        const filter_action_option = document.getElementById(
            "filter_action_option"
        ) as HTMLSelectElement;;
        try {
          await navigator.clipboard.writeText(filter_action_option.options[filter_action_option.selectedIndex].value);
        } catch (err) {
        }
    });

    ipcRenderer.on("update_filter_query_ingredients", (event, arg) => {
        let filter_query_ingredients_elem = document.getElementById(
            "filter_query_ingredient"
        ) as HTMLSelectElement;
        filter_query_ingredients_elem.innerHTML = "";
        for(let item of arg) {
            let option = document.createElement("option");
            option.value = item;
            option.text = item;
            filter_query_ingredients_elem.add(option);
        }
    });

    document.getElementById('copy_filter_query_ingredient')!.addEventListener('click', async () => {
        const filter_query_ingredient = document.getElementById(
            "filter_query_ingredient"
        ) as HTMLSelectElement;;
        try {
          await navigator.clipboard.writeText(filter_query_ingredient.options[filter_query_ingredient.selectedIndex].value);
        } catch (err) {
        }
    });
};
