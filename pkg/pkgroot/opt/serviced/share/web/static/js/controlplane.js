"use strict";

/* jshint unused: false */

// Copyright 2014 The Serviced Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// set this guy here to true to get waaaay
// more log messages. exciting!
var DEBUG = false;

/*******************************************************************************
 * Main module & controllers
 ******************************************************************************/
var controlplane = angular.module("controlplane", ["ngRoute", "ngCookies", "ngDragDrop", "pascalprecht.translate", "angularMoment", "zenNotify", "serviceHealth", "ui.datetimepicker", "modalService", "angular-data.DSCacheFactory", "ui.codemirror", "sticky", "graphPanel", "servicesFactory", "healthIcon", "healthStatus", "authService", "miscUtils", "hostsFactory", "poolsFactory", "instancesFactory", "baseFactory", "ngTable", "jellyTable", "ngLocationUpdate", "CCUIState", "servicedConfig"]);

controlplane.config(["$routeProvider", function ($routeProvider) {
    $routeProvider.when("/login", {
        templateUrl: "/static/partials/login.html",
        controller: "LoginController" }).when("/logs", {
        templateUrl: "/static/partials/logs.html",
        controller: "LogController" }).when("/services/:serviceId", {
        templateUrl: "/static/partials/view-subservices.html",
        controller: "ServiceDetailsController" }).when("/apps", {
        templateUrl: "/static/partials/view-apps.html",
        controller: "AppsController" }).when("/hosts", {
        templateUrl: "/static/partials/view-hosts.html",
        controller: "HostsController" }).when("/hostsmap", {
        templateUrl: "/static/partials/view-host-map.html",
        controller: "HostsMapController" }).when("/servicesmap", {
        templateUrl: "/static/partials/view-service-map.html",
        controller: "ServicesMapController" }).when("/hosts/:hostId", {
        templateUrl: "/static/partials/view-host-details.html",
        controller: "HostDetailsController" }).when("/pools", {
        templateUrl: "/static/partials/view-pools.html",
        controller: "PoolsController" }).when("/pools/:poolID", {
        templateUrl: "/static/partials/view-pool-details.html",
        controller: "PoolDetailsController" }).when("/backuprestore", {
        templateUrl: "/static/partials/view-backuprestore.html",
        controller: "BackupRestoreController"
    }).otherwise({ redirectTo: "/apps" });
}]).config(["$translateProvider", function ($translateProvider) {
    $translateProvider.useStaticFilesLoader({
        prefix: "/static/i18n/",
        suffix: ".json"
    });
    $translateProvider.preferredLanguage("en_US");
}]).config(["DSCacheFactoryProvider", function (DSCacheFactory) {
    DSCacheFactory.setCacheDefaults({
        // Items will not be deleted until they are requested
        // and have expired
        deleteOnExpire: "passive",

        // This cache will clear itself every hour
        cacheFlushInterval: 3600000,

        // This cache will sync itself with localStorage
        storageMode: "memory"
    });
}]).
/**
     * Default Get requests to no caching
     **/
config(["$httpProvider", function ($httpProvider) {
    //initialize get if not there
    if (!$httpProvider.defaults.headers.get) {
        $httpProvider.defaults.headers.get = {};
    }
    $httpProvider.defaults.headers.get["Cache-Control"] = "no-cache";
    $httpProvider.defaults.headers.get.Pragma = "no-cache";
    $httpProvider.defaults.headers.get["If-Modified-Since"] = "Mon, 26 Jul 1997 05:00:00 GMT";
}]).filter("treeFilter", function () {
    /*
         * @param items The array from ng-repeat
         * @param field Field on items to check for validity
         * @param validData Object with allowed objects
         */
    return function (items, field, validData) {
        if (!validData) {
            return items;
        }
        return items.filter(function (elem) {
            return validData[elem[field]] !== null;
        });
    };
}).filter("toGB", function () {
    return function (input, hide) {
        return (input / (1024 * 1024 * 1024)).toFixed(2) + (hide ? "" : " GB");
    };
}).filter("toMB", function () {
    return function (input, hide) {
        return (input / (1024 * 1024)).toFixed(2) + (hide ? "" : " MB");
    };
}).filter("cut", function () {
    return function (value, wordwise, max, tail) {
        if (!value) {
            return "";
        }

        max = parseInt(max, 10);
        if (!max) {
            return value;
        }
        if (value.length <= max) {
            return value;
        }

        value = value.substr(0, max);
        if (wordwise) {
            var lastspace = value.lastIndexOf(" ");
            if (lastspace !== -1) {
                value = value.substr(0, lastspace);
            }
        }

        return value + (tail || " …");
    };
}).filter("prettyDate", function () {
    return function (dateString) {
        return moment(new Date(dateString)).format("MMM Do YYYY, hh:mm:ss");
    };
}).
// create a human readable "fromNow" string from
// a date. eg: "a few seconds ago"
filter("fromNow", function () {
    return function (date) {
        return moment(date).fromNow();
    };
}).run(function ($rootScope, $window, $location) {
    // scroll to top of page on navigation
    $rootScope.$on("$routeChangeSuccess", function (event, currentRoute, previousRoute) {
        $window.scrollTo(0, 0);
    });

    var queryParams = $location.search(),
        disableAnimation = false;

    // option to disable animation for
    // acceptance tests
    if (queryParams["disable-animation"] === "true") {
        disableAnimation = true;
        $("body").addClass("no-animation");
    }

    var loaderEl = $(".loading_wrapper"),
        isCleared = false;

    $rootScope.$on("ready", function () {
        setTimeout(function () {
            if (!isCleared) {
                if (disableAnimation) {
                    clearLoader();
                } else {
                    loaderEl.addClass("hide_it").one("transitionend", clearLoader);
                }
            }
        }, 1000);

        var clearLoader = function () {
            loaderEl.remove();
            $("body").removeClass("loading");
            isCleared = true;
        };
    });
});
"use strict";

/* BackupRestoreController
 * Lists existing backups and allows creation
 * of new backups.
 */
(function () {
    "use strict";

    controlplane.controller("BackupRestoreController", ["$scope", "$routeParams", "$notification", "$translate", "resourcesFactory", "authService", "$modalService", function ($scope, $routeParams, $notification, $translate, resourcesFactory, authService, $modalService) {
        var pollBackupStatus = function (notification) {
            resourcesFactory.getBackupStatus().success(function (data) {
                if (data.Detail === "") {
                    notification.updateStatus(BACKUP_COMPLETE);
                    notification.success(false);
                    getBackupFiles();
                    return;
                } else if (data.Detail !== "timeout") {
                    notification.updateStatus(data.Detail);
                }

                // poll again
                setTimeout(function () {
                    pollBackupStatus(notification);
                }, 1);
            }).error(function (data, status) {
                backupRestoreError(notification, data.Detail, status);
            });
        };

        var pollRestoreStatus = function (notification) {
            resourcesFactory.getRestoreStatus().success(function (data) {
                // all done!
                if (data.Detail === "") {
                    notification.updateStatus(RESTORE_COMPLETE);
                    notification.success(false);
                    return;

                    // something neato has happened. lets show it.
                } else if (data.Detail !== "timeout") {
                    notification.updateStatus(data.Detail);
                }

                // poll again
                setTimeout(function () {
                    pollRestoreStatus(notification);
                }, 1);
            }).error(function (data, status) {
                backupRestoreError(notification, data.Detail, status);
            });
        };

        var backupRestoreError = function (notification, data, status) {
            notification.updateTitle(ERROR + " " + status);
            notification.updateStatus(data);
            notification.error();
        };

        var getBackupFiles = function () {
            resourcesFactory.getBackupFiles().success(function (data) {
                $scope.backupFiles = data;

                $scope.$emit("ready");
            });
        };

        var init = function () {
            $scope.name = "backuprestore";
            $scope.params = $routeParams;
            $scope.breadcrumbs = [{ label: "breadcrumb_backuprestore", itemClass: "active" }];

            $scope.backupTable = {
                sorting: {
                    full_path: "asc"
                }
            };

            //load backup files
            getBackupFiles();

            // poll for backup files
            resourcesFactory.registerPoll("running", getBackupFiles, 5000);
        };

        // Ensure logged in
        authService.checkLogin($scope);

        // localization messages
        var BACKUP_RUNNING = $translate.instant("backup_running"),
            BACKUP_COMPLETE = $translate.instant("backup_complete"),
            RESTORE_RUNNING = $translate.instant("restore_running"),
            RESTORE_COMPLETE = $translate.instant("restore_complete"),
            ERROR = $translate.instant("error");

        $scope.createBackup = function () {
            $modalService.create({
                template: $translate.instant("confirm_start_backup"),
                model: $scope,
                title: "backup_create",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "backup_create",
                    action: function () {
                        var notification = $notification.create("Backup").updateStatus(BACKUP_RUNNING).show(false);

                        // TODO - when the server switches to broadcast instead of
                        // channel. this can be greatly simplified
                        resourcesFactory.createBackup().success(function checkFirstStatus() {
                            // recursively check if a valid status has been pushed into
                            // the pipe. if not, shake yourself off and try again. try again.
                            resourcesFactory.getBackupStatus().success(function (data) {
                                // no status has been pushed, so check again
                                if (data.Detail === "") {
                                    checkFirstStatus();

                                    // a valid status has been pushed, so
                                    // start the usual poll cycle
                                } else {
                                    pollBackupStatus(notification);
                                }
                            }).error(function (data, status) {
                                backupRestoreError(notification, data.Detail, status);
                            });
                        }).error(function (data, status) {
                            backupRestoreError(notification, data.Detail, status);
                        });

                        this.close();
                    }
                }]
            });
        };

        $scope.restoreBackup = function (filename) {
            $modalService.create({
                template: $translate.instant("confirm_start_restore"),
                model: $scope,
                title: "restore",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "restore",
                    classes: "btn-danger",
                    action: function () {
                        var notification = $notification.create("Restore").updateStatus(RESTORE_RUNNING).show(false);

                        // TODO - when the server switches to broadcast instead of
                        // channel. this can be greatly simplified
                        resourcesFactory.restoreBackup(filename).success(function checkFirstStatus() {
                            // recursively check if a valid status has been pushed into
                            // the pipe. if not, shake yourself off and try again. try again.
                            resourcesFactory.getRestoreStatus().success(function (data) {
                                // no status has been pushed, so check again
                                if (data.Detail === "") {
                                    checkFirstStatus();

                                    // a valid status has been pushed, so
                                    // start the usual poll cycle
                                } else {
                                    notification.updateStatus(data.Detail);
                                    pollRestoreStatus(notification);
                                }
                            }).error(function (data, status) {
                                backupRestoreError(notification, data.Detail, status);
                            });
                        }).error(function (data, status) {
                            backupRestoreError(notification, data.Detail, status);
                        });

                        this.close();
                    }
                }]
            });
        };

        init();

        $scope.$on("$destroy", function () {
            resourcesFactory.unregisterAllPolls();
        });
    }]);
})();
"use strict";

/* globals controlplane: true */

/* DeployWizard.js
 * Guides user through deployment of an app
 */
(function () {
    "use strict";

    controlplane.controller("DeployWizard", ["$scope", "$notification", "$translate", "$q", "resourcesFactory", "servicesFactory", "miscUtils", "hostsFactory", "poolsFactory", function ($scope, $notification, $translate, $q, resourcesFactory, servicesFactory, utils, hostsFactory, poolsFactory) {
        var step = 0;
        var nextClicked = false;
        $scope.name = "wizard";

        $scope.dockerLoggedIn = true;

        resourcesFactory.dockerIsLoggedIn().success(function (loggedIn) {
            $scope.dockerLoggedIn = loggedIn;
        });

        $scope.dockerIsNotLoggedIn = function () {
            return !$scope.dockerLoggedIn;
        };

        var validTemplateSelected = function () {
            if (!$scope.install.templateID) {
                showError($translate.instant("label_wizard_select_app"));
                return false;
            } else {
                resetError();
            }

            return true;
        };

        var validDeploymentID = function () {
            if ($scope.install.deploymentID === undefined || $scope.install.deploymentID === "") {
                showError($translate.instant("label_wizard_deployment_id"));
                return false;
            } else {
                resetError();
            }

            return true;
        };

        var validTemplateUpload = function () {
            var uploadedFiles = $("#new_template_filename_wizard")[0].files;
            if (uploadedFiles.length === 0) {
                showError($translate.instant("template_error"));
                return false;
            } else {
                var formData = new FormData();
                $.each(uploadedFiles, function (key, value) {
                    formData.append("tpl", value);
                });
                resourcesFactory.addAppTemplate(formData).success($scope.refreshAppTemplates).error(function () {
                    showError("Add Application Template failed");
                });

                resetError();
                return true;
            }
        };

        var validHost = function () {
            var err = utils.validateHostName($scope.newHost.host, $translate) || utils.validatePortNumber($scope.newHost.port, $translate) || utils.validateRAMLimit($scope.newHost.RAMLimit);
            if (err) {
                showError(err);
                return false;
            }

            $scope.newHost.IPAddr = $scope.newHost.host + ":" + $scope.newHost.port;

            resourcesFactory.addHost($scope.newHost).success(function () {
                step += 1;
                resetError();
                $scope.step_page = $scope.steps[step].content;
            }).error(function (data) {
                // if it already exists then allow the user to continue
                if (data.Detail.indexOf("already exists") !== -1) {
                    step += 1;
                    resetError();
                    $scope.step_page = $scope.steps[step].content;
                } else {
                    showError("Add Host failed", data.Detail);
                }
            });




            return false;
        };

        var resetStepPage = function () {
            step = 0;

            $scope.install = {
                poolID: "default"
            };

            if ($scope.templates.data.length === 0) {
                $scope.steps.unshift({
                    content: "/static/partials/wizard-modal-add-template.html",
                    label: "template_add",
                    validate: validTemplateUpload
                });
            }

            // if there is not at least one host, add an
            // "add host" step to the wizard
            if (hostsFactory.hostList.length === 0) {
                $scope.newHost = {
                    port: $translate.instant("placeholder_port")
                };
                if ($scope.pools.length > 0) {
                    $scope.newHost.PoolID = $scope.pools[0].id;
                }
                $scope.steps.unshift({
                    content: "/static/partials/wizard-modal-add-host.html",
                    label: "add_host",
                    validate: validHost
                });
            }

            $scope.step_page = $scope.steps[step].content;
        };

        var showError = function (message) {
            $("#deployWizardNotificationsContent").html(message);
            $("#deployWizardNotifications").removeClass("hide");
        };

        var resetError = function () {
            $("#deployWizardNotifications").html("");
            $("#deployWizardNotifications").addClass("hide");
        };

        $scope.steps = [{
            content: "/static/partials/wizard-modal-2.html",
            label: "label_step_select_app",
            validate: validTemplateSelected
        }, {
            content: "/static/partials/wizard-modal-3.html",
            label: "label_step_select_pool" }, {
            content: "/static/partials/wizard-modal-4.html",
            label: "label_step_deploy",
            validate: validDeploymentID
        }];

        $scope.install = {
            poolID: "default"
        };

        $scope.selectTemplate = function (template) {
            $scope.template = template;
            $scope.install.templateID = template.ID;
        };

        $scope.selectPool = function (pool) {
            $scope.install.poolID = pool.id;
        };

        $scope.getTemplateRequiredResources = function (template) {
            var ret = { CPUCommitment: 0, RAMCommitment: 0 };

            // if Services, iterate and sum up their commitment values
            if (template.Services) {
                var suffixToMultiplier = {
                    "": 1,
                    k: 1 << 10,
                    m: 1 << 20,
                    g: 1 << 30,
                    t: 1 << 40
                };
                var engNotationRE = /([0-9]*)([kKmMgGtT]?)/;
                // Convert an engineeringNotation string to a number
                var toBytes = function (RAMCommitment) {
                    if (RAMCommitment === "") {
                        return 0;
                    }
                    var match = RAMCommitment.match(engNotationRE);
                    var numeric = match[1];
                    var suffix = match[2].toLowerCase();
                    var multiplier = suffixToMultiplier[suffix];
                    var val = parseInt(numeric);
                    return val * multiplier;
                };
                // recursively calculate cpu and ram commitments
                (function calcCommitment(services) {
                    services.forEach(function (service) {
                        // CPUCommitment should be equal to max number of
                        // cores needed by any service
                        ret.CPUCommitment = Math.max(ret.CPUCommitment, service.CPUCommitment);
                        // RAMCommitment should be a sum of all ram needed
                        // by all services
                        ret.RAMCommitment += toBytes(service.RAMCommitment);

                        // recurse!
                        if (service.Services) {
                            calcCommitment(service.Services);
                        }
                    });
                })(template.Services);
            }

            return ret;
        };

        $scope.addHostStart = function () {
            $scope.newHost = {
                port: $translate.instant("placeholder_port")
            };
            if ($scope.pools.length > 0) {
                $scope.newHost.PoolID = $scope.pools[0].id;
            }
            $scope.step_page = "/static/partials/wizard-modal-addhost.html";
        };

        $scope.hasPrevious = function () {
            return step > 0 && $scope.step_page === $scope.steps[step].content;
        };

        $scope.hasNext = function () {
            return step + 1 < $scope.steps.length && $scope.step_page === $scope.steps[step].content;
        };

        $scope.hasFinish = function () {
            return step + 1 === $scope.steps.length;
        };

        $scope.step_item = function (index) {
            var cls = index <= step ? "active" : "inactive";
            if (index === step) {
                cls += " current";
            }
            return cls;
        };

        $scope.step_label = function (index) {
            return index < step ? "done" : "";
        };

        $scope.wizard_next = function () {
            nextClicked = true;

            if ($scope.step_page !== $scope.steps[step].content) {
                $scope.step_page = $scope.steps[step].content;
                nextClicked = false;
                return;
            }

            if ($scope.steps[step].validate) {
                if (!$scope.steps[step].validate()) {
                    nextClicked = false;
                    return;
                }
            }

            step += 1;
            resetError();
            $scope.step_page = $scope.steps[step].content;
            nextClicked = false;
        };

        $scope.wizard_previous = function () {
            step -= 1;
            $scope.step_page = $scope.steps[step].content;
            resetError();
        };

        $scope.wizard_finish = function () {
            var closeModal = function () {
                $("#addApp").modal("hide");
                $("#deploy-save-button").removeAttr("disabled");
                $("#deploy-save-button").removeClass("active");
                resetStepPage();
                resetError();
            };

            nextClicked = true;
            if ($scope.steps[step].validate) {
                if (!$scope.steps[step].validate()) {
                    return;
                }
            }

            $("#deploy-save-button").toggleClass("active");
            $("#deploy-save-button").attr("disabled", "disabled");

            var deploymentDefinition = {
                poolID: $scope.install.poolID,
                TemplateID: $scope.install.templateID,
                DeploymentID: $scope.install.deploymentID
            };

            var checkStatus = true;
            resourcesFactory.deployAppTemplate(deploymentDefinition).success(function () {
                checkStatus = false;
                servicesFactory.update(true, false);
                $notification.create("App deployed successfully").success();
                closeModal();
            }).error(function (data, status) {
                checkStatus = false;
                $notification.create("App deploy failed", data.Detail).error();
                closeModal();
            });

            //now that we have started deploying our app, we poll for status
            var getStatus = function () {
                if (checkStatus) {
                    var $status = $("#deployStatusText");
                    resourcesFactory.getDeployStatus(deploymentDefinition).success(function (data) {
                        if (data.Detail === "timeout") {
                            $("#deployStatus .dialogIcon").fadeOut(200, function () {
                                $("#deployStatus .dialogIcon").fadeIn(200);
                            });
                        } else {
                            var parts = data.Detail.split("|");
                            if (parts[1]) {
                                $status.html("<strong>" + $translate.instant(parts[0]) + ":</strong> " + parts[1]);
                            } else {
                                $status.html("<strong>" + $translate.instant(parts[0]) + "</strong>");
                            }
                        }
                    }).error(function (err) {
                        console.warn("Error getting deploy status", err);
                    })["finally"](function () {
                        getStatus();
                    });
                }
            };

            $("#deployStatus").show();
            getStatus();

            nextClicked = false;
        };

        $scope.refreshAppTemplates = function () {
            var MAX_RETRIES = 4;
            var deferred = $q.defer(),
                attempts = 0;

            // allow requests to be repeated if necessary
            var fetch = function () {
                resourcesFactory.getAppTemplates().then(function (templatesMap) {
                    var templates = [];
                    for (var key in templatesMap) {
                        var template = templatesMap[key];
                        template.ID = key;
                        templates.push(template);
                    }
                    $scope.templates.data = templates;
                    deferred.resolve();
                }, function () {
                    if (attempts >= MAX_RETRIES) {
                        deferred.reject("Unable to refresh application templates");
                    }
                    // retry in 3s
                    setTimeout(fetch, 3000);
                    attempts++;
                });
            };
            fetch();

            return deferred.promise;
        };

        $scope.refreshAppTemplates().then(function () {
            hostsFactory.update()["finally"](resetStepPage);
        }, function (e) {
            console.error(e);
        });

        poolsFactory.update()["finally"](function () {
            $scope.pools = poolsFactory.poolList;
        });
    }]);
})();
"use strict";

/* globals jstz: true */

/* graphpanel
 * creates graphs from graph configs, and provides
 * controls for displayed range and update frequency
 */

(function () {
    "use strict";

    angular.module("graphPanel", []).directive("graphPanel", ["$interval", "$location", function ($interval, $location) {
        return {
            restrict: "E",
            scope: {
                serviceId: "=",
                graphConfigs: "="
            },
            templateUrl: "/static/partials/graphpanel.html",
            link: function ($scope, element) {
                var updateGraphRequest = function (graph) {
                    // update aggregator
                    graph.datapoints.forEach(function (dp) {
                        dp.aggregator = $scope.graphConfig.aggregator;
                    });

                    // if end should always be "now", use current time
                    if ($scope.graphConfig.now) {
                        $scope.graphConfig.end = zenoss.utils.createDate("0s-ago").format(momentFormat);
                        graph.range.end = zenoss.utils.createDate($scope.graphConfig.end).valueOf();

                        // else, use specified end time
                    } else {
                        graph.range.end = zenoss.utils.createDate($scope.graphConfig.end).valueOf();
                    }

                    // if range, update start time
                    if ($scope.graphConfig.range !== CUSTOM_RANGE) {
                        $scope.graphConfig.start = zenoss.utils.createDate($scope.graphConfig.range).format(momentFormat);
                    }
                    // update start/end
                    graph.range.start = zenoss.utils.createDate($scope.graphConfig.start).valueOf();
                };

                // configure viz library
                zenoss.visualization.url = $location.protocol() + "://" + $location.host() + ":" + $location.port();
                zenoss.visualization.urlPath = "/metrics/static/performance/query/";
                zenoss.visualization.urlPerformance = "/metrics/api/performance/query/";
                zenoss.visualization.debug = false;

                $scope.graphs = {};
                $scope.showStartEnd = false;
                $scope.showGraphControls = false;
                $scope.refreshInterval = 300000;

                var momentFormat = "MM/DD/YYYY  HH:mm:ss";

                // graph configuration used to generate
                // query service requests
                $scope.graphConfig = {
                    aggregator: "sum",
                    start: zenoss.utils.createDate("1h-ago").format(momentFormat),
                    end: zenoss.utils.createDate("0s-ago").format(momentFormat),
                    range: "1h-ago",
                    now: true
                };

                $scope.viz = function (graph) {
                    var id = $scope.getUniqueGraphId(graph),
                        graphCopy;

                    if (!$scope.graphs[id]) {
                        if (window.zenoss === undefined) {
                            return "Not collecting stats, graphs unavailable";
                        } else {
                            // create a copy of graph so that range changes
                            // do not affect the original service def
                            graphCopy = angular.copy(graph);

                            // set graphs to local browser time
                            graphCopy.timezone = jstz.determine().name();

                            updateGraphRequest(graphCopy);
                            zenoss.visualization.chart.create(id, graphCopy);

                            // store graph def for later use
                            $scope.graphs[id] = graphCopy;
                        }
                    }
                };

                $scope.datetimePickerOptions = {
                    maxDate: new Date(),
                    mask: true,
                    closeOnDateSelect: true,
                    format: "m/d/Y  H:i:s",
                    onChangeDateTime: function () {
                        // let angular finish current digest cycle
                        // before updating the graphs
                        setTimeout(function () {
                            $scope.refreshGraphs();
                        }, 0);
                    }
                };

                // select options for graph aggregation
                $scope.aggregators = [{
                    name: "Average",
                    val: "avg"
                }, {
                    name: "Sum",
                    val: "sum"
                }];
                // refresh intervals
                $scope.intervals = [{
                    name: "1 Second",
                    val: 1000
                }, {
                    name: "5 Seconds",
                    val: 5000
                }, {
                    name: "1 Minute",
                    val: 60000
                }, {
                    name: "5 Minutes",
                    val: 300000
                }, {
                    name: "15 Minutes",
                    val: 900000
                }, {
                    name: "Never",
                    val: 0
                }];
                // select options for graph ranges
                var CUSTOM_RANGE = "custom";
                $scope.ranges = [{
                    name: "Last hour",
                    val: "1h-ago"
                }, {
                    name: "Last 4 hours",
                    val: "4h-ago"
                }, {
                    name: "Last 12 hours",
                    val: "12h-ago"
                }, {
                    name: "Last 24 hours",
                    val: "1d-ago"
                }, {
                    name: "Last 48 hours",
                    val: "2d-ago"
                }, {
                    name: "[Custom]",
                    val: CUSTOM_RANGE
                }];

                // on range select change, update start/end
                // values to reflect the selected range
                $scope.rangeChange = function () {
                    var range = $scope.graphConfig.range;

                    if (range === CUSTOM_RANGE) {
                        // show start/end options
                        $scope.showStartEnd = true;
                    } else {
                        // hide start/end opts
                        $scope.showStartEnd = false;

                        // parse graph range into something the date picker likes
                        $scope.graphConfig.start = zenoss.utils.createDate($scope.graphConfig.range).format(momentFormat);

                        // when using a range, always use "now" for the end time
                        $scope.graphConfig.end = zenoss.utils.createDate("0s-ago").format(momentFormat);
                    }

                    $scope.refreshGraphs();
                };


                // on refresh change, update refresh interval
                $scope.setupAutoRefresh = function () {
                    // cancel existing refresh
                    $interval.cancel($scope.refreshPromise);

                    // if refreshInterval is zero, don't setup
                    // a refresh interval
                    if ($scope.refreshInterval) {
                        // start auto-refresh
                        $scope.refreshPromise = $interval(function () {
                            $scope.refreshGraphs();
                        }, $scope.refreshInterval);
                    }
                };

                // kick off inital graph request
                $scope.setupAutoRefresh();

                $scope.refreshGraphs = function () {
                    // don't refresh graph if tab is not visible
                    if (document.hidden) {
                        return;
                    }

                    var graph;

                    // iterate and update all graphs
                    for (var i in $scope.graphs) {
                        graph = $scope.graphs[i];
                        updateGraphRequest(graph);
                        zenoss.visualization.chart.update(i, graph);
                    }
                };

                $scope.getUniqueGraphId = function (graph) {
                    return ($scope.serviceId + "-graph-" + graph.id).replace(/\./g, "_");
                };

                $scope.cleanup = function () {
                    var chart;

                    // remove graph from cache
                    for (var id in $scope.graphs) {
                        // TODO - expose removeChart() and use it
                        chart = zenoss.visualization.chart.getChart(id);
                        chart.onDestroyed();
                    }

                    $scope.graphs = {};
                };

                $scope.graphControlsPopover = function () {
                    $scope.showGraphControls = !$scope.showGraphControls;
                };

                // make clicking anywhere outside of graph
                // control hide it
                var hideGraphControls = function () {
                    $scope.showGraphControls = false;
                    // force angular to apply the visibility change
                    $scope.$apply();
                };
                angular.element("html").on("click", hideGraphControls);

                $scope.$watch("serviceId", $scope.cleanup);

                $scope.$on("$destroy", function () {
                    $scope.cleanup();
                    $interval.cancel($scope.refreshPromise);
                    angular.element("html").off("click", hideGraphControls);
                });
            }
        };
    }]);
})();
"use strict";

var _defineProperty = function (obj, key, value) {
    return Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
    });
};

/* healthIconDirective
 * directive for displaying health of a service/instance
 * in icon form with helpful popover details
 */
(function () {
    "use strict";

    angular.module("healthIcon", []).directive("healthIcon", ["hcStatus", function (hcStatus) {
        var OK = hcStatus.OK;
        var FAILED = hcStatus.FAILED;
        var NOT_RUNNING = hcStatus.NOT_RUNNING;
        var UNKNOWN = hcStatus.UNKNOWN;


        return {
            restrict: "E",
            scope: {
                // status object generated by serviceHealth
                status: "="
            },
            template: "<i class=\"healthIcon glyphicon\"></i><div class=\"healthIconBadge\"></div>",
            link: function ($scope, element, attrs) {
                var update = function () {
                    var statusObj,
                        popoverHTML,
                        hideHealthChecks,
                        placement = "right",
                        popoverObj,
                        template;

                    statusObj = $scope.status;

                    if (!statusObj) {
                        // TODO - re-implement?
                        //statusObj = new Status(id, "", 1);
                        //statusObj.statusRollup.incNotRunning();
                        //statusObj.evaluateStatus();
                        return;
                    }


                    // determine if we should hide healthchecks
                    hideHealthChecks = statusObj.statusRollup.allOK() || statusObj.statusRollup.allNotRunning() || statusObj.desiredState === 0;

                    // if service should be up and there is more than 1 instance, show number of instances
                    if (statusObj.desiredState === 1 && statusObj.statusRollup.total > 1) {
                        $el.addClass("wide");
                        $badge.text(statusObj.statusRollup[OK] + "/" + statusObj.statusRollup.total).show();

                        // else, hide the badge
                    } else {
                        $el.removeClass("wide");
                        $badge.hide();
                    }

                    // setup popover

                    // if this $el is inside a .serviceTitle, make the popover point down
                    if ($el.parent().hasClass("serviceTitle")) {
                        placement = "bottom";
                    }

                    // if this statusObj has children, we wanna show
                    // them in the healtcheck tooltip, so generate
                    // some yummy html
                    if (statusObj.children.length) {
                        popoverHTML = [];

                        var isHealthCheckStatus = function (status) {
                            return !status.id;
                        };

                        // if this status's children are healthchecks,
                        // no need for instance rows, go straight to healthcheck rows
                        if (statusObj.children.length && isHealthCheckStatus(statusObj.children[0])) {
                            // if these are JUST healthchecks, then don't allow them
                            // to be hidden. this ensures that healthchecks show up for
                            // running instances.
                            hideHealthChecks = false;
                            // don't show count badge for healthchecks either
                            $badge.hide();
                            $el.removeClass("wide");

                            statusObj.children.forEach(function (hc) {
                                popoverHTML.push(bindHealthCheckRowTemplate(hc));
                            });

                            // else these are instances, so create instance rows
                            // AND healthcheck rows
                        } else {
                            statusObj.children.forEach(function (instanceStatus) {
                                // if this is becoming too long, stop adding rows
                                if (popoverHTML.length >= 15) {
                                    // add an overflow indicator if not already there
                                    if (popoverHTML[popoverHTML.length - 1] !== "...") {
                                        popoverHTML.push("...");
                                    }
                                    return;
                                }

                                // only create an instance row for this instance if
                                // it's in a bad or unknown state
                                if (instanceStatus.status === FAILED || instanceStatus.status === UNKNOWN) {
                                    popoverHTML.push("<div class='healthTooltipDetailRow'>");
                                    popoverHTML.push("<div style='font-weight: bold; font-size: .9em; padding: 5px 0 3px 0;'>" + instanceStatus.name + "</div>");
                                    instanceStatus.children.forEach(function (hc) {
                                        popoverHTML.push(bindHealthCheckRowTemplate(hc));
                                    });
                                    popoverHTML.push("</div>");
                                }
                            });
                        }

                        popoverHTML = popoverHTML.join("");
                    }

                    // choose a popover template which is just a title,
                    // or a title and content
                    template = hideHealthChecks || !popoverHTML ? "<div class=\"popover\" role=\"tooltip\"><div class=\"arrow\"></div><h3 class=\"popover-title\"></h3></div>" : "<div class=\"popover\" role=\"tooltip\"><div class=\"arrow\"></div><h3 class=\"popover-title\"></h3><div class=\"popover-content\"></div></div>";

                    // NOTE: directly accessing the bootstrap popover
                    // data object here.
                    popoverObj = $el.data("bs.popover");

                    // if popover element already exists, update it
                    if (popoverObj) {
                        // update title, content, and template
                        popoverObj.options.title = statusObj.description;
                        popoverObj.options.content = popoverHTML;
                        popoverObj.options.template = template;

                        // if the tooltip already exists, change the contents
                        // to the new template
                        if (popoverObj.$tip) {
                            popoverObj.$tip.html($(template).html());
                        }

                        // force popover to update using the new options
                        popoverObj.setContent();

                        // if the popover is currently visible, update
                        // it immediately, but turn off animation to
                        // prevent it fading in
                        if (popoverObj.$tip.is(":visible")) {
                            popoverObj.options.animation = false;
                            popoverObj.show();
                            popoverObj.options.animation = true;
                        }

                        // if popover element doesn't exist, create it
                    } else {
                        $el.popover({
                            trigger: "hover",
                            placement: placement,
                            delay: 0,
                            title: statusObj.description,
                            html: true,
                            content: popoverHTML,
                            template: template
                        });
                    }

                    $el.removeClass(Object.keys(STATUS_STYLES).join(" ")).addClass(statusObj.status);

                    // if the status has changed since last tick, or
                    // it was and is still unknown, notify user
                    if (lastStatus !== statusObj.status || lastStatus === UNKNOWN && statusObj.status === UNKNOWN) {
                        bounceStatus($el);
                    }
                    // store the status for comparison later
                    lastStatus = statusObj.status;
                };

                var bindHealthCheckRowTemplate = function (hc) {
                    return "<div class='healthTooltipDetailRow " + hc.status + "'>                            <i class='healthIcon glyphicon'></i>                        <div class='healthTooltipDetailName'>" + hc.name + "</div>                    </div>";
                };

                var bounceStatus = function ($el) {
                    $el.addClass("zoom");

                    $el.on("webkitAnimationEnd animationend", function () {
                        $el.removeClass("zoom");
                        // clean up animation end listener
                        $el.off("webkitAnimationEnd animationend");
                    });
                };

                var STATUS_STYLES = (function () {
                    var _STATUSSTYLES = {};

                    _defineProperty(_STATUSSTYLES, FAILED, "glyphicon glyphicon-exclamation bad");

                    _defineProperty(_STATUSSTYLES, OK, "glyphicon glyphicon-ok good");

                    _defineProperty(_STATUSSTYLES, UNKNOWN, "glyphicon glyphicon-question unknown");

                    _defineProperty(_STATUSSTYLES, NOT_RUNNING, "glyphicon glyphicon-minus disabled");

                    return _STATUSSTYLES;
                })();

                // cache some DOM elements
                var $el = $(element),
                    $badge = $el.find(".healthIconBadge"),
                    lastStatus;

                // if status object updates, update icon
                $scope.$watch("status", update);

                // TODO - cleanup watch
                $scope.$on("$destroy", function () {});
            }
        };
    }]);
})();
"use strict";

/* healthStatusDirective
 * directive for displaying health of a service/instance
 * using popover details
 */
(function () {
    "use strict";

    angular.module("healthStatus", []).directive("healthStatus", ["$translate", function ($translate) {
        var linker = function ($scope, element, attrs) {
            // Because we don't need to track status, we just need to enable the
            // bootstrap popover.
            // Set the popup with the content data.
            $(element).popover({
                trigger: "hover",
                placement: "top",
                delay: 0,
                content: $translate.instant("vhost_unavailable") });
        };
        return {
            restrict: "E",
            link: linker
        };
    }]);
})();
"use strict";

/* jshint multistr: true */
(function () {
    "use strict";

    // OK means health check is passing
    var OK = "passed";
    // Failed means health check is responsive, but failing
    var FAILED = "failed";
    // Timeout means health check is non-responsive in the given time
    var TIMEOUT = "timeout";
    // NotRunning means the instance is not running
    var NOT_RUNNING = "not_running";
    // Unknown means the instance hasn't checked in within the provided time
    // limit.
    var UNKNOWN = "unknown";

    var serviceHealthModule = angular.module("serviceHealth", []);

    // share constants for other packages to use
    serviceHealthModule.value("hcStatus", {
        OK: OK,
        FAILED: FAILED,
        TIMEOUT: TIMEOUT,
        NOT_RUNNING: NOT_RUNNING,
        UNKNOWN: UNKNOWN
    });

    serviceHealthModule.factory("$serviceHealth", ["$translate", function ($translate) {
        // updates health check data for all services
        var update = function (serviceList) {
            var serviceStatus, instanceStatus, instanceUniqueId, service;

            statuses = {};

            // iterate services healthchecks
            for (var serviceId in serviceList) {
                service = serviceList[serviceId];
                serviceStatus = new Status(serviceId, service.name, service.model.DesiredState);

                // refresh list of instances
                service.getServiceInstances();

                // if this service has instances, evaluate their health
                service.instances.forEach(function (instance) {
                    // create a new status rollup for this instance
                    instanceUniqueId = serviceId + "." + instance.id;
                    instanceStatus = new Status(instanceUniqueId, service.name + " " + instance.id, service.model.DesiredState);

                    // evalute instance healthchecks and roll em up
                    instanceStatus.evaluateHealthChecks(instance.healthChecks);
                    // store resulting status on instance
                    instance.status = instanceStatus;

                    // add this guy's statuses to hash map for easy lookup
                    statuses[instanceUniqueId] = instanceStatus;
                    // add this guy's status to his parent
                    serviceStatus.children.push(instanceStatus);
                });

                // now that this services instances have been evaluated,
                // evaluate the status of this service
                serviceStatus.evaluateChildren();

                statuses[serviceId] = serviceStatus;
            }

            return statuses;
        };

        // used by Status to examine children and figure
        // out what the parent's status is
        var StatusRollup = function () {
            this[OK] = 0;
            this[FAILED] = 0;
            this[NOT_RUNNING] = 0;
            this[UNKNOWN] = 0;
            this.total = 0;
        };

        var Status = function (id, name, desiredState) {
            this.id = id;
            this.name = name;
            this.desiredState = desiredState;

            this.statusRollup = new StatusRollup();
            this.children = [];

            this.status = null;
            this.description = null;
        };

        var statuses = {};
        StatusRollup.prototype = {
            constructor: StatusRollup,

            incOK: function () {
                this.incStatus(OK);
            },
            incFailed: function () {
                this.incStatus(FAILED);
            },
            incNotRunning: function () {
                this.incStatus(NOT_RUNNING);
            },
            incUnknown: function () {
                this.incStatus(UNKNOWN);
            },
            incStatus: function (status) {
                if (this[status] !== undefined) {
                    this[status]++;
                    this.total++;
                }
            },

            // TODO - use assertion style ie: status.is.ok() or status.any.ok()
            anyFailed: function () {
                return !!this[FAILED];
            },
            allFailed: function () {
                return this.total && this[FAILED] === this.total;
            },
            anyOK: function () {
                return !!this[OK];
            },
            allOK: function () {
                return this.total && this[OK] === this.total;
            },
            anyNotRunning: function () {
                return !!this[NOT_RUNNING];
            },
            allNotRunning: function () {
                return this.total && this[NOT_RUNNING] === this.total;
            },
            anyUnknown: function () {
                return !!this[UNKNOWN];
            },
            allUnknown: function () {
                return this.total && this[UNKNOWN] === this.total;
            }
        };

        Status.prototype = {
            constructor: Status,

            // distill this service's statusRollup into a single value
            evaluateStatus: function () {
                if (this.desiredState === 1) {
                    // if any failing, bad!
                    if (this.statusRollup.anyFailed()) {
                        this.status = FAILED;
                        this.description = $translate.instant("failing_health_checks");

                        // if any notRunning, oh no!
                    } else if (this.statusRollup.anyNotRunning()) {
                        this.status = UNKNOWN;
                        this.description = $translate.instant("starting_service");

                        // if all are ok, yay! ok!
                    } else if (this.statusRollup.allOK()) {
                        this.status = OK;
                        this.description = $translate.instant("passing_health_checks");

                        // some health checks are late
                    } else {
                        this.status = UNKNOWN;
                        this.description = $translate.instant("missing_health_checks");
                    }
                } else if (this.desiredState === 0) {
                    // shouldnt be running, but still getting health checks,
                    // so probably stopping
                    if (this.statusRollup.anyOK() || this.statusRollup.anyFailed() || this.statusRollup.anyUnknown()) {
                        this.status = UNKNOWN;
                        this.description = $translate.instant("stopping_service");

                        // stuff is notRunning as expected
                    } else {
                        this.status = NOT_RUNNING;
                        this.description = $translate.instant("container_down");
                    }
                }
            },

            // roll up child status into this status
            evaluateChildren: function () {
                this.statusRollup = this.children.reduce((function (acc, childStatus) {
                    acc.incStatus(childStatus.status);
                    return acc;
                }).bind(this), new StatusRollup());
                this.evaluateStatus();
            },

            // set this status's statusRollup based on healthchecks
            // NOTE - subtly different than evaluateChildren
            evaluateHealthChecks: function (healthChecks) {
                for (var name in healthChecks) {
                    this.statusRollup.incStatus(healthChecks[name]);
                    this.children.push({
                        name: name,
                        status: healthChecks[name]
                    });
                }
                this.evaluateStatus();
            } };

        return {
            update: update,
            get: function (id) {
                var status = statuses[id];

                // if no status found, return unknown
                if (!status) {
                    status = new Status(id, UNKNOWN, 0);
                    status.evaluateStatus();
                }

                return status;
            }
        };
    }]);
})();
"use strict";

/* globals controlplane: true */

/* HostDetailsController
 * Displays list of hosts
 */
(function () {
    "use strict";

    controlplane.controller("HostDetailsController", ["$scope", "$routeParams", "$location", "resourcesFactory", "authService", "$modalService", "$translate", "miscUtils", "hostsFactory", "$notification", "instancesFactory", "servicesFactory", function ($scope, $routeParams, $location, resourcesFactory, authService, $modalService, $translate, utils, hostsFactory, $notification, instancesFactory, servicesFactory) {
        var init = function () {
            // start polling
            hostsFactory.activate();
            servicesFactory.activate();
            servicesFactory.update();

            $scope.ipsTable = {
                sorting: {
                    InterfaceName: "asc"
                },
                watchExpression: function () {
                    return hostsFactory.lastUpdate;
                }
            };

            $scope.instancesTable = {
                sorting: {
                    name: "asc"
                },
                watchExpression: function () {
                    return instancesFactory.lastUpdate;
                }
            };

            // kick off hostsFactory updating
            // TODO - update loop here
            hostsFactory.update().then(function () {
                $scope.currentHost = hostsFactory.get($scope.params.hostId);
                $scope.breadcrumbs.push({ label: $scope.currentHost.name, itemClass: "active" });
            });
        };

        // Ensure logged in
        authService.checkLogin($scope);

        $scope.name = "hostdetails";
        $scope.params = $routeParams;

        $scope.breadcrumbs = [{ label: "breadcrumb_hosts", url: "/hosts" }];

        $scope.viewLog = function (instance) {
            var _this = this;
            $scope.editService = angular.copy(instance);
            resourcesFactory.getInstanceLogs(instance.model.ServiceID, instance.id).success(function (log) {
                $scope.editService.log = log.Detail;
                $modalService.create({
                    templateUrl: "view-log.html",
                    model: $scope,
                    title: "title_log",
                    bigModal: true,
                    actions: [{
                        role: "cancel",
                        label: "close"
                    }, {
                        classes: "btn-primary",
                        label: "refresh",
                        icon: "glyphicon-repeat",
                        action: function () {
                            var _this2 = this;
                            var textarea = this.$el.find("textarea");
                            resourcesFactory.getInstanceLogs(instance.model.ServiceID, instance.id).success(function (log) {
                                $scope.editService.log = log.Detail;
                                textarea.scrollTop(textarea[0].scrollHeight - textarea.height());
                            }).error(function (data, status) {
                                _this2.createNotification("Unable to fetch logs", data.Detail).error();
                            });
                        }
                    }, {
                        classes: "btn-primary",
                        label: "download",
                        action: function () {
                            utils.downloadFile("/services/" + instance.model.ServiceID + "/" + instance.model.ID + "/logs/download");
                        },
                        icon: "glyphicon-download"
                    }],
                    onShow: function () {
                        var textarea = this.$el.find("textarea");
                        textarea.scrollTop(textarea[0].scrollHeight - textarea.height());
                    }
                });
            }).error(function (data, status) {
                _this.createNotification("Unable to fetch logs", data.Detail).error();
            });
        };

        $scope.click_app = function (instance) {
            $location.path("/services/" + instance.model.ServiceID);
        };

        $scope.editCurrentHost = function () {
            $scope.editableHost = {
                Name: $scope.currentHost.name,
                RAMLimit: $scope.currentHost.RAMLimit
            };

            $modalService.create({
                templateUrl: "edit-host.html",
                model: $scope,
                title: "title_edit_host",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "btn_save_changes",
                    action: function () {
                        var hostModel = angular.copy($scope.currentHost.model);
                        angular.extend(hostModel, $scope.editableHost);

                        if (this.validate()) {
                            // disable ok button, and store the re-enable function
                            var enableSubmit = this.disableSubmitButton();

                            // update host with recently edited host
                            resourcesFactory.updateHost($scope.currentHost.id, hostModel).success((function (data, status) {
                                $notification.create("Updated host", hostModel.Name).success();
                                this.close();
                            }).bind(this)).error((function (data, status) {
                                this.createNotification("Update host failed", data.Detail).error();
                                enableSubmit();
                            }).bind(this));
                        }
                    }
                }],
                validate: function () {
                    var err = utils.validateRAMLimit($scope.editableHost.RAMLimit, $scope.currentHost.model.Memory);
                    if (err) {
                        this.createNotification("Error", err).error();
                        return false;
                    }
                    return true;
                }
            });
        };

        init();

        $scope.$on("$destroy", function () {
            hostsFactory.deactivate();
            servicesFactory.deactivate();
        });
    }]);
})();
"use strict";

/* HostsController
 * Displays details for a specific host
 */
(function () {
    "use strict";

    controlplane.controller("HostsController", ["$scope", "$routeParams", "$location", "$filter", "resourcesFactory", "authService", "$modalService", "$interval", "$translate", "$notification", "miscUtils", "hostsFactory", "poolsFactory", "servicesFactory", function ($scope, $routeParams, $location, $filter, resourcesFactory, authService, $modalService, $interval, $translate, $notification, utils, hostsFactory, poolsFactory, servicesFactory) {
        var update = function () {
            hostsFactory.update().then(function () {
                $scope.hosts = hostsFactory.hostList;
            });

            poolsFactory.update().then(function () {
                $scope.pools = poolsFactory.poolList;
                $scope.resetNewHost();
            });
        };

        var init = function () {
            $scope.name = "hosts";
            $scope.params = $routeParams;

            $scope.breadcrumbs = [{ label: "breadcrumb_hosts", itemClass: "active" }];

            $scope.hostsTable = {
                sorting: {
                    name: "asc"
                },
                watchExpression: function () {
                    return hostsFactory.lastUpdate;
                }
            };

            $scope.dropped = [];

            // update hosts
            update();

            servicesFactory.activate();
            hostsFactory.activate();
            poolsFactory.activate();
        };

        // Ensure logged in
        authService.checkLogin($scope);

        $scope.indent = utils.indentClass;

        $scope.resetNewHost = function () {
            $scope.newHost = {
                port: $translate.instant("placeholder_port")
            };
            if ($scope.pools.length > 0) {
                $scope.newHost.PoolID = $scope.pools[0].id;
            }
        };

        $scope.modalAddHost = function () {
            $modalService.create({
                templateUrl: "add-host.html",
                model: $scope,
                title: "add_host",
                actions: [{
                    role: "cancel",
                    action: function () {
                        $scope.resetNewHost();
                        this.close();
                    }
                }, {
                    role: "ok",
                    label: "add_host",
                    action: function () {
                        if (this.validate()) {
                            // disable ok button, and store the re-enable function
                            var enableSubmit = this.disableSubmitButton();
                            if ($scope.newHost.RAMLimit === undefined || $scope.newHost.RAMLimit === "") {
                                $scope.newHost.RAMLimit = "100%";
                            }

                            $scope.newHost.IPAddr = $scope.newHost.host + ":" + $scope.newHost.port;

                            resourcesFactory.addHost($scope.newHost).success((function (data, status) {
                                $notification.create("", data.Detail).success();
                                this.close();
                                update();
                            }).bind(this)).error((function (data, status) {
                                // TODO - form error highlighting
                                this.createNotification("", data.Detail).error();
                                // reenable button
                                enableSubmit();
                            }).bind(this));
                        }
                    }
                }],
                validate: function () {
                    var err = utils.validateHostName($scope.newHost.host, $translate) || utils.validatePortNumber($scope.newHost.port, $translate) || utils.validateRAMLimit($scope.newHost.RAMLimit);
                    if (err) {
                        this.createNotification("Error", err).error();
                        return false;
                    }
                    return true;
                }
            });
        };

        $scope.remove_host = function (hostId) {
            $modalService.create({
                template: $translate.instant("confirm_remove_host") + " <strong>" + hostsFactory.get(hostId).name + "</strong>",
                model: $scope,
                title: "remove_host",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "remove_host",
                    classes: "btn-danger",
                    action: function () {
                        resourcesFactory.removeHost(hostId).success((function (data, status) {
                            $notification.create("Removed host", hostId).success();
                            // After removing, refresh our list
                            update();
                            this.close();
                        }).bind(this)).error((function (data, status) {
                            $notification.create("Removing host failed", data.Detail).error();
                            this.close();
                        }).bind(this));
                    }
                }]
            });
        };

        $scope.clickHost = function (hostId) {
            resourcesFactory.routeToHost(hostId);
        };

        $scope.clickPool = function (poolID) {
            resourcesFactory.routeToPool(poolID);
        };

        init();

        $scope.$on("$destroy", function () {
            hostsFactory.deactivate();
            servicesFactory.deactivate();
            poolsFactory.deactivate();
        });
    }]);
})();
"use strict";

// hostssFactory
// - maintains a list of hosts and keeps it in sync with the backend.
(function () {
    "use strict";

    // Host object constructor
    // takes a host object (backend host object)
    // and wraps it with extra functionality and info
    var Host = function (host) {
        this.active = false;
        this.update(host);
    };

    // make angular share with everybody!
    var resourcesFactory, $q, instancesFactory, utils;

    angular.module("hostsFactory", []).factory("hostsFactory", ["$rootScope", "$q", "resourcesFactory", "$interval", "instancesFactory", "baseFactory", "miscUtils", function ($rootScope, q, _resourcesFactory, $interval, _instancesFactory, BaseFactory, _utils) {
        // share resourcesFactory throughout
        resourcesFactory = _resourcesFactory;
        instancesFactory = _instancesFactory;
        $q = q;
        utils = _utils;

        var newFactory = new BaseFactory(Host, resourcesFactory.getHosts);

        // alias some stuff for ease of use
        newFactory.hostList = newFactory.objArr;
        newFactory.hostMap = newFactory.objMap;

        // wrap update to do some extra work
        newFactory.update = utils.after(newFactory.update, function () {
            var _this = this;
            // check running hosts and mark them as active
            resourcesFactory.getRunningHosts().success(function (activeHosts, status) {
                _this.hostList.forEach(function (host) {
                    if (activeHosts.indexOf(host.id) !== -1) {
                        host.active = true;
                    } else {
                        host.active = false;
                    }
                });
            });
        }, newFactory);

        return newFactory;
    }]);

    Host.prototype = {
        constructor: Host,

        update: function (host) {
            if (host) {
                this.updateHostDef(host);
            }
        },

        updateHostDef: function (host) {
            this.name = host.Name;
            this.id = host.ID;
            this.model = Object.freeze(host);
        },

        resourcesGood: function () {
            return this.RAMAverage <= this.RAMLimitBytes;
        },

        RAMIsPercent: function () {
            return this.RAMLimit.endsWith("%");
        }
    };

    Object.defineProperty(Host.prototype, "instances", {
        get: function () {
            return instancesFactory.getByHostId(this.id);
        }
    });

    // RAMLimit may not be set yet, so use RAMCommitment
    // NOTE: RAMCommitment is deprecated
    Object.defineProperty(Host.prototype, "RAMLimit", {
        get: function () {
            if (!this.model) {
                return undefined;
            }

            if (this.model.RAMLimit) {
                return this.model.RAMLimit;
            } else {
                // RAMCommitment of 0 means 100% commitment
                return this.model.RAMCommitment || "100%";
            }
        }
    });

    // get the RAMLimit in bytes
    Object.defineProperty(Host.prototype, "RAMLimitBytes", {
        get: function () {
            // if percentange
            if (this.RAMIsPercent()) {
                return +this.RAMLimit.slice(0, -1) * this.model.Memory * 0.01;
                // if stringy value
            } else {
                return utils.parseEngineeringNotation(this.RAMLimit);
            }
        }
    });

    Object.defineProperty(Host.prototype, "RAMLast", {
        get: function () {
            var instances = this.instances;
            var sum = 0;
            for (var i = 0; i < instances.length; i++) {
                sum += instances[i].resources.RAMLast;
            }
            return sum;
        }
    });

    Object.defineProperty(Host.prototype, "RAMMax", {
        get: function () {
            var instances = this.instances;
            var sum = 0;
            for (var i = 0; i < instances.length; i++) {
                sum += instances[i].resources.RAMMax;
            }
            return sum;
        }
    });

    Object.defineProperty(Host.prototype, "RAMAverage", {
        get: function () {
            var instances = this.instances;
            var sum = 0;
            for (var i = 0; i < instances.length; i++) {
                sum += instances[i].resources.RAMAverage;
            }
            return sum;
        }
    });
})();
"use strict";

// instancesFactory
// - maintains a list of instances and keeps it in sync with the backend.
(function () {
    "use strict";

    // Instance object constructor
    // takes a instance object (backend instance object)
    // and wraps it with extra functionality and info
    var Instance = function (instance) {
        this.active = false;

        this.resources = {
            RAMCommitment: 0,
            RAMLast: 0,
            RAMMax: 0,
            RAMAverage: 0
        };

        this.healthChecks = {};
        this.update(instance);
    };

    var resourcesFactory, $q, serviceHealth, $notification, utils;

    angular.module("instancesFactory", []).factory("instancesFactory", ["$rootScope", "$q", "resourcesFactory", "$interval", "$serviceHealth", "baseFactory", "$notification", "miscUtils", function ($rootScope, q, _resourcesFactory, $interval, _serviceHealth, BaseFactory, _notification, _utils) {
        // share resourcesFactory throughout
        resourcesFactory = _resourcesFactory;
        $q = q;
        serviceHealth = _serviceHealth;
        $notification = _notification;
        utils = _utils;

        var newFactory = new BaseFactory(Instance, resourcesFactory.getServiceInstances);

        // alias some stuff for ease of use
        newFactory.instanceArr = newFactory.objArr;
        newFactory.instanceMap = newFactory.objMap;

        angular.extend(newFactory, {
            getByServiceId: function (id) {
                var results = [];
                for (var i in this.instanceMap) {
                    if (this.instanceMap[i].model.ServiceID === id) {
                        results.push(this.instanceMap[i]);
                    }
                }
                return results;
            },

            getByHostId: function (id) {
                var results = [];
                for (var i in this.instanceMap) {
                    if (this.instanceMap[i].model.HostID === id) {
                        results.push(this.instanceMap[i]);
                    }
                }
                return results;
            } });

        newFactory.update = utils.after(newFactory.update, function () {
            // call update on all children
            newFactory.instanceArr.forEach(function (instance) {
                return instance.update();
            });
        }, newFactory);

        return newFactory;
    }]);

    Instance.prototype = {
        constructor: Instance,

        update: function (instance) {
            if (instance) {
                this.updateInstanceDef(instance);
            }
        },

        updateInstanceDef: function (instance) {
            this.name = instance.Name;
            this.id = instance.ID;
            this.model = Object.freeze(instance);
            this.resources.RAMAverage = Math.max(0, instance.RAMAverage);
            this.resources.RAMLast = Math.max(0, instance.RAMLast);
            this.resources.RAMMax = Math.max(0, instance.RAMMax);
            this.resources.RAMCommitment = utils.parseEngineeringNotation(instance.RAMCommitment);

            var hc = {};
            for (var name in instance.HealthChecks) {
                hc[name] = instance.HealthChecks[name].Status;
            }
            this.healthChecks = hc;
        },

        stop: function () {
            var _this = this;
            resourcesFactory.killRunning(this.model.HostID, this.id).success(function () {
                _this.update();
            }).error(function (data, status) {
                $notification.create("Stop Instance failed", data.Detail).error();
            });
        },

        resourcesGood: function () {
            return this.resources.RAMLast < this.resources.RAMCommitment;
        }
    };
})();
"use strict";

/* HostsMapController
 * Neato treemap of hosts and resources
 */
(function () {
    "use strict";

    controlplane.controller("HostsMapController", ["$scope", "$routeParams", "$location", "resourcesFactory", "authService", "miscUtils", "hostsFactory", "poolsFactory", function ($scope, $routeParams, $location, resourcesFactory, authService, utils, hostsFactory, poolsFactory) {
        // Ensure logged in
        authService.checkLogin($scope);

        $scope.name = "hostsmap";
        $scope.params = $routeParams;
        $scope.indent = utils.indentClass;
        $scope.breadcrumbs = [{ label: "breadcrumb_hosts", url: "/hosts" }, { label: "breadcrumb_hosts_map", itemClass: "active" }];

        var width = 857;
        var height = 567;

        var cpuCores = function (h) {
            return h.model.Cores;
        };
        var memoryCapacity = function (h) {
            return h.model.Memory;
        };
        var poolBgColor = function (p) {
            return p.isHost ? null : color(p.Id);
        };
        var hostText = function (h) {
            return h.isHost ? h.name : null;
        };

        var color = d3.scale.category20c();
        var treemap = d3.layout.treemap().size([width, height]).value(memoryCapacity);

        var position = function () {
            this.style("left", function (d) {
                return d.x + "px";
            }).style("top", function (d) {
                return d.y + "px";
            }).style("width", function (d) {
                return Math.max(0, d.dx - 1) + "px";
            }).style("height", function (d) {
                return Math.max(0, d.dy - 1) + "px";
            });
        };

        $scope.selectionButtonClass = function (id) {
            var cls = "btn btn-link nav-link";
            if ($scope.treemapSelection === id) {
                cls += " active";
            }
            return cls;
        };

        $scope.selectByMemory = function () {
            $scope.treemapSelection = "memory";
            selectNewValue(memoryCapacity);
        };
        $scope.selectByCores = function () {
            $scope.treemapSelection = "cpu";
            selectNewValue(cpuCores);
        };

        var selectNewValue = function (valFunc) {
            var node = d3.select("#hostmap").selectAll(".node").data(treemap.value(valFunc).nodes);
            node.enter().append("div").attr("class", "node");
            node.transition().duration(1000).call(position).style("background", poolBgColor).text(hostText);
            node.exit().remove();
        };

        var selectNewRoot = function (newroot) {
            console.log("Selected %s", newroot.Id);
            var node = d3.select("#hostmap").datum(newroot).selectAll(".node").data(treemap.nodes);

            node.enter().append("div").attr("class", "node");

            node.transition().duration(1000).call(position).style("background", poolBgColor).text(hostText);
            node.exit().remove();
        };

        var hostsAddedToPools = false;
        var wait = { pools: false, hosts: false };
        var addHostsToPools = function () {
            var root = undefined;

            if (!wait.pools || !wait.hosts) {
                return;
            }
            if (hostsAddedToPools) {
                console.log("Already built");
                return;
            }

            console.log("Preparing tree map");
            hostsAddedToPools = true;
            hostsFactory.hostList.forEach(function (host) {
                var pool = poolsFactory.get(host.model.PoolID);
                // TODO - don't add stuff to pool and host objects!
                if (!pool.children) {
                    pool.children = [];
                }
                pool.children.push(host);
                host.isHost = true;
            });

            root = { Id: "All Resource Pools", children: poolsFactory.poolList };
            selectNewRoot(root);
        };
        $scope.treemapSelection = "memory";
        // Also ensure we have a list of hosts
        poolsFactory.update().then(function () {
            wait.pools = true;
            addHostsToPools();
        });
        hostsFactory.update().then(function () {
            wait.hosts = true;
            addHostsToPools();
        });
    }]);
})();
"use strict";

/* LanguageController
 * toggle selected language
 */
(function () {
    "use strict";

    controlplane.controller("LanguageController", ["$scope", "$cookies", "$translate", "miscUtils", function ($scope, $cookies, $translate, utils) {
        $scope.name = "language";
        $scope.setUserLanguage = function () {
            console.log("User clicked", $scope.user.language);
            $cookies.Language = $scope.user.language;
            utils.updateLanguage($scope, $cookies, $translate);
        };
        $scope.getLanguageClass = function (language) {
            return $scope.user.language === language ? "btn btn-primary active" : "btn btn-primary";
        };
    }]);
})();
"use strict";

/* LoginController
 * login page
 */
(function () {
    "use strict";

    controlplane.controller("LoginController", ["$scope", "$location", "$notification", "$translate", "authService", function ($scope, $location, $notification, $translate, authService) {
        var enableLoginButton = function () {
            $scope.loginButtonText = "log_in";
            $scope.loginDisabled = false;
        };

        var disableLoginButton = function () {
            $scope.loginButtonText = "logging_in";
            $scope.loginDisabled = true;
        };

        if (navigator.userAgent.indexOf("Trident") > -1 && navigator.userAgent.indexOf("MSIE 7.0") > -1) {
            $notification.create("", $translate.instant("compatibility_mode"), $("#loginNotifications")).warning(false);
        }

        enableLoginButton();

        $scope.$emit("ready");

        // Makes XHR POST with contents of login form
        $scope.login = function () {
            disableLoginButton();

            var creds = { Username: $scope.username, Password: $scope.password };
            authService.login(creds, function () {
                enableLoginButton();
                // Redirect to main page
                $location.path("/apps");
            }, function () {
                enableLoginButton();
                // display fail message to user
                $notification.create("", $translate.instant("login_fail"), $("#loginNotifications")).error();
            });
        };
    }]);
})();
"use strict";

/* LogController
 * displays kibaba log iframe
 */
(function () {
    "use strict";

    controlplane.controller("LogController", ["$scope", "authService", function ($scope, authService) {
        authService.checkLogin($scope);
        $scope.breadcrumbs = [{ label: "breadcrumb_logs", itemClass: "active" }];

        $scope.$emit("ready");

        // force log iframe to fill screen
        setInterval(function () {
            var logsframe = document.getElementById("logsframe");

            if (logsframe && logsframe.contentWindow.document.body) {
                var h = logsframe.contentWindow.document.body.clientHeight;
                logsframe.height = h + "px";
            }
        }, 100);
    }]);
})();
"use strict";

/* globals controlplane: true */
/* NavbarController.js
 * Controls the navbar. what else were you thinking it would do?
 */
(function () {
    "use strict";

    controlplane.controller("NavbarController", ["$scope", "$rootScope", "$cookies", "$location", "$route", "$translate", "$notification", "authService", "resourcesFactory", "$modalService", "miscUtils", function ($scope, $rootScope, $cookies, $location, $route, $translate, $notification, authService, resourcesFactory, $modalService, utils) {
        $scope.name = "navbar";
        $scope.brand = { url: "#/apps", label: "brand_cp" };

        $rootScope.messages = $notification.getMessages();
        $scope.$on("messageUpdate", function () {
            $rootScope.messages = $notification.getMessages();
            if (!$scope.$$phase) {
                $scope.$apply();
            }
        });
        $rootScope.markRead = function (message) {
            $notification.markRead(message);
        };
        $rootScope.clearMessages = function () {
            $notification.clearAll();
        };

        $scope.navlinks = [{ url: "#/apps", label: "nav_apps", sublinks: ["#/services/", "#/servicesmap"] }, { url: "#/pools", label: "nav_pools", sublinks: ["#/pools/"] }, { url: "#/hosts", label: "nav_hosts", sublinks: ["#/hosts/", "#/hostsmap"] }, { url: "#/logs", label: "nav_logs", sublinks: [] }, { url: "#/backuprestore", label: "nav_backuprestore", sublinks: [] }];

        for (var i = 0; i < $scope.navlinks.length; i++) {
            var cls = "";
            var currUrl = "#" + $location.path();
            if ($scope.navlinks[i].url === currUrl) {
                cls = "active";
            } else {
                for (var j = 0; j < $scope.navlinks[i].sublinks.length; j++) {
                    if (currUrl.indexOf($scope.navlinks[i].sublinks[j]) === 0) {
                        cls = "active";
                    }
                }
            }
            $scope.navlinks[i].itemClass = cls;
        }

        $scope.subNavClick = function (crumb) {
            // if parent scope has defined a handler
            // for sub nav click, use it
            if ($scope.$parent && $scope.$parent.subNavClick) {
                $scope.$parent.subNavClick(crumb);
            } else {
                $location.path(crumb.url);
            }
        };

        // watch parent for new breadcrumbs
        $scope.$watch("$parent.breadcrumbs", function () {
            $scope.breadcrumbs = $scope.$parent.breadcrumbs;
        });

        // Create a logout function
        $scope.logout = function () {
            authService.logout();
        };

        $scope.modalUserDetails = function () {
            $modalService.create({
                templateUrl: "user-details.html",
                model: $scope,
                title: "title_user_details",
                bigModal: true
            });
        };

        $scope.modalAbout = function () {
            resourcesFactory.getVersion().success(function (data) {
                $scope.version = data;
            });

            $modalService.create({
                templateUrl: "about.html",
                model: $scope,
                title: "title_about"
            });
        };

        utils.updateLanguage($scope, $cookies, $translate);

        var helpMap = {
            "/static/partials/login.html": "login.html",
            "/static/partials/view-subservices.html": "subservices.html",
            "/static/partials/view-apps.html": "apps.html",
            "/static/partials/view-hosts.html": "hosts.html",
            "/static/partials/view-host-map.html": "hostmap.html",
            "/static/partials/view-service-map.html": "servicemap.html",
            "/static/partials/view-host-details.html": "hostdetails.html",
            "/static/partials/view-devmode.html": "devmode.html"
        };

        $scope.help = {
            url: function () {
                return "/static/help/" + $scope.user.language + "/" + helpMap[$route.current.templateUrl];
            }
        };

        $scope.cookies = $cookies;
    }]);
})();
"use strict";

/* global controlplane: true */

/* PoolDetailsController
 * Displays details of a specific pool
 */
(function () {
    "use strict";

    controlplane.controller("PoolDetailsController", ["$scope", "$routeParams", "$location", "resourcesFactory", "authService", "$modalService", "$translate", "$notification", "miscUtils", "hostsFactory", "poolsFactory", function ($scope, $routeParams, $location, resourcesFactory, authService, $modalService, $translate, $notification, utils, hostsFactory, poolsFactory) {
        var init = function () {
            $scope.name = "pooldetails";
            $scope.params = $routeParams;

            $scope.add_virtual_ip = {};

            $scope.breadcrumbs = [{ label: "breadcrumb_pools", url: "/pools" }];

            // start polling
            poolsFactory.activate();

            // Ensure we have a list of pools
            poolsFactory.update().then(function () {
                $scope.currentPool = poolsFactory.get($scope.params.poolID);
                if ($scope.currentPool) {
                    $scope.breadcrumbs.push({ label: $scope.currentPool.id, itemClass: "active" });

                    // start polling
                    hostsFactory.activate();

                    hostsFactory.update().then(function () {
                        // reduce the list to hosts associated with this pool
                        $scope.hosts = hostsFactory.hostList.filter(function (host) {
                            return host.model.PoolID === $scope.currentPool.id;
                        });
                    });
                }
            });

            $scope.virtualIPsTable = {
                sorting: {
                    IP: "asc"
                },
                watchExpression: function () {
                    // if poolsFactory updates, update view
                    return poolsFactory.lastUpdate;
                }
            };

            $scope.hostsTable = {
                sorting: {
                    name: "asc"
                },
                watchExpression: function () {
                    return hostsFactory.lastUpdate;
                }
            };
        };

        // Ensure logged in
        authService.checkLogin($scope);

        //
        // Scope methods
        //

        // Pool view action - delete
        $scope.clickRemoveVirtualIp = function (ip) {
            $modalService.create({
                template: $translate.instant("confirm_remove_virtual_ip") + " <strong>" + ip.IP + "</strong>",
                model: $scope,
                title: "remove_virtual_ip",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "remove_virtual_ip",
                    classes: "btn-danger",
                    action: function () {
                        resourcesFactory.removePoolVirtualIP(ip.PoolID, ip.IP).success(function (data) {
                            $notification.create("Removed Virtual IP", ip.IP).success();
                            poolsFactory.update();
                        }).error(function (data) {
                            $notification.create("Remove Virtual IP failed", data.Detail).error();
                        });
                        this.close();
                    }
                }]
            });
        };

        // Add Virtual Ip Modal - Add button action
        $scope.addVirtualIp = function (pool) {
            var ip = $scope.add_virtual_ip;

            return resourcesFactory.addPoolVirtualIP(ip.PoolID, ip.IP, ip.Netmask, ip.BindInterface).success(function (data, status) {
                $scope.add_virtual_ip = {};
                $notification.create("Added new pool virtual ip", ip).success();
                poolsFactory.update();
            }).error(function (data, status) {
                $notification.create("Add Virtual IP failed", data.Detail).error();
            });
        };

        // Open the virtual ip modal
        $scope.modalAddVirtualIp = function (pool) {
            $scope.add_virtual_ip = { PoolID: pool.id, IP: "", Netmask: "", BindInterface: "" };
            $modalService.create({
                templateUrl: "pool-add-virtualip.html",
                model: $scope,
                title: "add_virtual_ip",
                actions: [{
                    role: "cancel",
                    action: function () {
                        $scope.add_virtual_ip = {};
                        this.close();
                    }
                }, {
                    role: "ok",
                    label: "add_virtual_ip",
                    action: function () {
                        if (this.validate()) {
                            // disable ok button, and store the re-enable function
                            var enableSubmit = this.disableSubmitButton();

                            $scope.addVirtualIp($scope.add_virtual_ip).success((function (data, status) {
                                this.close();
                            }).bind(this)).error((function (data, status) {
                                this.createNotification("Adding pool virtual ip failed", data.Detail).error();
                                enableSubmit();
                            }).bind(this));
                        }
                    }
                }]
            });
        };

        // route host clicks to host page
        $scope.clickHost = function (hostId) {
            resourcesFactory.routeToHost(hostId);
        };

        init();

        $scope.$on("$destroy", function () {
            poolsFactory.deactivate();
            hostsFactory.deactivate();
        });
    }]);
})();
"use strict";

/* global controlplane: true */

/* PoolsControl
 * Displays list of pools
 */
(function () {
    "use strict";

    controlplane.controller("PoolsController", ["$scope", "$routeParams", "$location", "$filter", "$timeout", "resourcesFactory", "authService", "$modalService", "$translate", "$notification", "miscUtils", "poolsFactory", function ($scope, $routeParams, $location, $filter, $timeout, resourcesFactory, authService, $modalService, $translate, $notification, utils, poolsFactory) {
        var init = function () {
            $scope.name = "pools";
            $scope.params = $routeParams;
            $scope.newPool = {};

            $scope.breadcrumbs = [{ label: "breadcrumb_pools", itemClass: "active" }];

            // start polling
            poolsFactory.activate();

            $scope.pools = {};
            poolsFactory.update().then(function () {
                $scope.pools = poolsFactory.poolMap;
            });

            $scope.poolsTable = {
                sorting: {
                    id: "asc"
                },
                watchExpression: function () {
                    // if poolsFactory updates, update view
                    return poolsFactory.lastUpdate;
                }
            };
        };

        // Ensure logged in
        authService.checkLogin($scope);

        $scope.click_pool = function (id) {
            resourcesFactory.routeToPool(id);
        };

        // Function to remove a pool
        $scope.clickRemovePool = function (poolID) {
            if ($scope.isDefaultPool(poolID)) {
                return;
            }
            $modalService.create({
                template: $translate.instant("confirm_remove_pool") + "<strong>" + poolID + "</strong>",
                model: $scope,
                title: "remove_pool",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "remove_pool",
                    classes: "btn-danger",
                    action: function () {
                        resourcesFactory.removePool(poolID).success(function (data) {
                            $notification.create("Removed Pool", poolID).success();
                            poolsFactory.update();
                        }).error(function (data) {
                            $notification.create("Remove Pool failed", data.Detail).error();
                        });

                        this.close();
                    }
                }]
            });
        };

        // Function for opening add pool modal
        $scope.modalAddPool = function () {
            $scope.newPool = {};
            $modalService.create({
                templateUrl: "add-pool.html",
                model: $scope,
                title: "add_pool",
                actions: [{
                    role: "cancel",
                    action: function () {
                        $scope.newPool = {};
                        this.close();
                    }
                }, {
                    role: "ok",
                    label: "add_pool",
                    action: function () {
                        if (this.validate()) {
                            // disable ok button, and store the re-enable function
                            var enableSubmit = this.disableSubmitButton();

                            $scope.add_pool().success((function (data, status) {
                                $notification.create("Added new Pool", data.Detail).success();
                                this.close();
                            }).bind(this)).error((function (data, status) {
                                this.createNotification("Adding pool failed", data.Detail).error();
                                enableSubmit();
                            }).bind(this));
                        }
                    }
                }]
            });
        };

        // Function for adding new pools - through modal
        $scope.add_pool = function () {
            return resourcesFactory.addPool($scope.newPool).success(function (data) {
                poolsFactory.update();
                // Reset for another add
                $scope.newPool = {};
            });
        };

        $scope.isDefaultPool = function (poolID) {
            return poolID === "default";
        };

        // kick off controller
        init();

        $scope.$on("$destroy", function () {
            poolsFactory.deactivate();
        });
    }]);
})();
"use strict";

// poolsFactory
// - maintains a list of pools and keeps it in sync with the backend.
(function () {
    "use strict";

    // Pool object constructor
    // takes a pool object (backend pool object)
    // and wraps it with extra functionality and info
    var Pool = function (pool) {
        this.update(pool);
    };

    var resourcesFactory, $q;

    angular.module("poolsFactory", []).factory("poolsFactory", ["$rootScope", "$q", "resourcesFactory", "$interval", "baseFactory", function ($rootScope, q, _resourcesFactory, $interval, BaseFactory) {
        // share resourcesFactory throughout
        resourcesFactory = _resourcesFactory;
        $q = q;

        var newFactory = new BaseFactory(Pool, resourcesFactory.getPools);

        // alias some stuff for ease of use
        newFactory.poolList = newFactory.objArr;
        newFactory.poolMap = newFactory.objMap;

        return newFactory;
    }]);

    Pool.prototype = {
        constructor: Pool,

        update: function (pool) {
            if (pool) {
                this.updatePoolDef(pool);
            }
        },

        updatePoolDef: function (pool) {
            this.name = pool.Name;
            this.id = pool.ID;
            this.model = Object.freeze(pool);
        }
    };
})();
"use strict";

/* globals controlplane: true */

/* AppsController
 * Displays top level apps
 */
(function () {
    "use strict";

    controlplane.controller("AppsController", ["$scope", "$routeParams", "$location", "$notification", "resourcesFactory", "authService", "$modalService", "$translate", "$timeout", "$cookies", "servicesFactory", "miscUtils", "ngTableParams", "$filter", "poolsFactory", function ($scope, $routeParams, $location, $notification, resourcesFactory, authService, $modalService, $translate, $timeout, $cookies, servicesFactory, utils, NgTableParams, $filter, poolsFactory) {


        /*
         * PRIVATE FUNCTIONS
         */
        var refreshTemplates = function () {
            resourcesFactory.getAppTemplates().success(function (templates) {
                $scope.templates.data = utils.mapToArr(templates);
            });
        };

        var getDeploying = function () {
            resourcesFactory.getDeployingTemplates().success(function (data) {
                if (data) {
                    $scope.deployingServices = data;
                }

                //if we have fewer results than last poll, we need to refresh our table
                //TODO - better checking for deploying apps
                if (lastPollResults > $scope.deployingServices.length) {
                    servicesFactory.update();
                }
                lastPollResults = $scope.deployingServices.length;
            });
        };

        var removeService = function (service) {
            return resourcesFactory.removeService(service.id).success(function () {
                // NOTE: this is here because services are
                // incrementally updated, which makes it impossible
                // to determine if a service has been removed
                // TODO - once the backend notifies on deleted
                // services, this should be removed
                // FIXME - should not modify servicesFactory's
                // objects!
                for (var i = 0; i < $scope.apps.length; i++) {
                    // find the removed service and remove it
                    if ($scope.apps[i].id === service.id) {
                        $scope.apps.splice(i, 1);
                        return;
                    }
                }
            });
        };

        var deleteTemplate = function (templateID) {
            return resourcesFactory.removeAppTemplate(templateID).success(refreshTemplates);
        };

        // init stuff for this controller
        var init = function () {
            if (utils.needsHostAlias($location.host())) {
                resourcesFactory.getHostAlias().success(function (data) {
                    $scope.defaultHostAlias = data.hostalias;
                });
            }

            // configure tables
            // TODO - move table config to view/directive
            $scope.breadcrumbs = [{ label: "breadcrumb_deployed", itemClass: "active" }];

            $scope.servicesTable = {
                sorting: {
                    name: "asc"
                },
                getData: function (data, params) {
                    // use built-in angular filter
                    var orderedData = params.sorting() ? $filter("orderBy")(data, params.orderBy()) : data;

                    if (!orderedData) {
                        return;
                    }

                    // mark any deploying services so they can be treated differently
                    orderedData.forEach(function (service) {
                        service.deploying = false;
                        $scope.deployingServices.forEach(function (deploying) {
                            if (service.model.DeploymentID === deploying.DeploymentID) {
                                service.deploying = true;
                            }
                        });
                    });

                    return orderedData;
                },
                watchExpression: function () {
                    // TODO - check $scope.deployingServices as well
                    return servicesFactory.lastUpdate;
                }
            };

            $scope.templates = { data: [] };
            // table config
            $scope.templatesTable = {
                sorting: {
                    Name: "asc"
                }
            };

            // Get a list of templates
            refreshTemplates();

            // check for deploying apps
            getDeploying();

            // start polling for apps
            servicesFactory.activate();
            servicesFactory.update().then(function () {
                // locally bind top level service list
                $scope.apps = servicesFactory.serviceTree;

                // if only isvcs are deployed, and this is the first time
                // running deploy wizard, show the deploy apps modal
                if (!$cookies.autoRunWizardHasRun && $scope.apps.length === 1) {
                    $scope.modal_deployWizard();
                }
            });

            // deploy wizard needs updated pools
            poolsFactory.activate();

            //register polls
            resourcesFactory.registerPoll("deployingApps", getDeploying, 3000);
            resourcesFactory.registerPoll("templates", refreshTemplates, 5000);

            //unregister polls on destroy
            $scope.$on("$destroy", function () {
                resourcesFactory.unregisterAllPolls();
            });
        };

        // Ensure logged in
        authService.checkLogin($scope);

        // alias hostname instead of using localhost or IP
        $scope.defaultHostAlias = $location.host();

        // redirect to specific service details
        $scope.routeToService = function (id) {
            resourcesFactory.routeToService(id);
        };

        // redirect to specific pool
        $scope.routeToPool = function (id) {
            resourcesFactory.routeToPool(id);
        };

        $scope.modal_deployWizard = function () {
            // the modal occasionally won't show on page load, so we use a timeout to get around that.
            $timeout(function () {
                $("#addApp").modal("show");

                // don't auto-show this wizard again
                // NOTE: $cookies can only deal with string values
                $cookies.autoRunWizardHasRun = "true";
            });
        };

        $scope.modal_addTemplate = function () {
            $modalService.create({
                templateUrl: "add-template.html",
                model: $scope,
                title: "template_add",
                actions: [{
                    role: "cancel",
                    action: function () {
                        $scope.newHost = {};
                        this.close();
                    }
                }, {
                    role: "ok",
                    label: "template_add",
                    action: function () {
                        if (this.validate()) {
                            var data = new FormData();

                            $.each($("#new_template_filename")[0].files, function (key, value) {
                                data.append("tpl", value);
                            });

                            // disable ok button, and store the re-enable function
                            var enableSubmit = this.disableSubmitButton();

                            resourcesFactory.addAppTemplate(data).success((function (data) {
                                $notification.create("Added template", data.Detail).success();
                                refreshTemplates();
                                this.close();
                            }).bind(this)).error((function (data) {
                                this.createNotification("Adding template failed", data.Detail).error();
                                enableSubmit();
                            }).bind(this));
                        }
                    }
                }]
            });
        };

        // aggregate vhosts for a specified service, but
        // only if the service has changed since last request
        $scope.aggregateVHosts = utils.memoize(function (service) {
            var endPoints = [];

            service.model.Endpoints.forEach(function (endpoint) {
                if (endpoint.VHostList) {
                    endpoint.VHostList.forEach(function (vHost) {
                        return endPoints.push(vHost);
                    });
                }
                if (endpoint.PortList) {
                    endpoint.PortList.forEach(function (port) {
                        return endPoints.push(port);
                    });
                }
            });

            endPoints.sort();

            return endPoints;
        }, function (service) {
            return service.id + service.model.DatabaseVersion;
        });

        // given an endpoint, return a url to it
        $scope.publicEndpointURL = function (publicEndpoint) {
            if ("Name" in publicEndpoint) {
                var port = $location.port() === "" ? "" : ":" + $location.port();
                var host = publicEndpoint.Name.indexOf(".") === -1 ? publicEndpoint.Name + "." + $scope.defaultHostAlias : publicEndpoint.Name;
                return $location.protocol() + "://" + host + port;
            } else if ("PortNumber" in publicEndpoint) {
                // Port public endpoint port listeners are always on http
                return "http://" + $scope.defaultHostAlias + publicEndpoint.PortAddr;
            }
        };

        $scope.modal_removeService = function (service) {
            $modalService.create({
                template: $translate.instant("warning_remove_service"),
                model: $scope,
                title: "remove_service",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "remove_service",
                    classes: "btn-danger submit",
                    action: function () {
                        var _this = this;
                        if (this.validate()) {
                            this.disableSubmitButton();

                            removeService(service).success(function () {
                                $notification.create("Removed App", service.name).success();
                                _this.close();
                            }).error(function (data, status) {
                                $notification.create("Remove App failed", data.Detail).error();
                                _this.close();
                            });
                        }
                    }
                }]
            });
        };

        $scope.startService = function (service) {
            $scope.modal_startStopService(service, "start");
        };
        $scope.stopService = function (service) {
            $scope.modal_startStopService(service, "stop");
        };
        $scope.modal_startStopService = function (service, status) {
            var displayStatus = utils.capitalizeFirst(status);

            $modalService.create({
                template: $translate.instant("confirm_" + status + "_app"),
                model: $scope,
                title: displayStatus + " Services",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: displayStatus + " Services",
                    action: function () {
                        service[status]();
                        this.close();
                    }
                }]
            });
        };

        // sets a service to start, stop or restart state
        $scope.setServiceState = function (service, state, skipChildren) {
            service[state](skipChildren).error(function (data, status) {
                $notification.create("Unable to " + state + " service", data.Detail).error();
            });
        };

        // filters to be used when counting how many descendent
        // services will be affected by a state change
        var serviceStateChangeFilters = {
            // only stopped services will be started
            start: function (service) {
                return service.desiredState === 0;
            },
            // only started services will be stopped
            stop: function (service) {
                return service.desiredState === 1;
            },
            // only started services will be restarted
            restart: function (service) {
                return service.desiredState === 1;
            }
        };

        // clicks to a service's start, stop, or restart
        // button should first determine if the service has
        // children and ask the user to choose to start all
        // children or only the top service
        $scope.clickRunning = function (service, state) {
            var filterFn = serviceStateChangeFilters[state];
            var childCount = utils.countTheKids(service, filterFn);

            // if the service has affected children, check if the user
            // wants to start just the service, or the service and children
            if (childCount > 0) {
                $scope.modal_confirmSetServiceState(service, state, childCount);

                // if no children, just start the service
            } else {
                $scope.setServiceState(service, state);
            }
            servicesFactory.updateHealth();
        };

        // verifies if use wants to start parent service, or parent
        // and all children
        $scope.modal_confirmSetServiceState = function (service, state, childCount) {
            $modalService.create({
                template: ["<h4>" + $translate.instant("choose_services_" + state) + "</h4><ul>", "<li>" + $translate.instant(state + "_service_name", { name: "<strong>" + service.name + "</strong>" }) + "</li>", "<li>" + $translate.instant(state + "_service_name_and_children", { name: "<strong>" + service.name + "</strong>", count: "<strong>" + childCount + "</strong>" }) + "</li></ul>"].join(""),
                model: $scope,
                title: $translate.instant(state + "_service"),
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    classes: " ",
                    label: $translate.instant(state + "_service"),
                    action: function () {
                        // the arg here explicitly prevents child services
                        // from being started
                        $scope.setServiceState(service, state, true);
                        this.close();
                    }
                }, {
                    role: "ok",
                    label: $translate.instant(state + "_service_and_children", { count: childCount }),
                    action: function () {
                        $scope.setServiceState(service, state);
                        this.close();
                    }
                }]
            });
        };

        $scope.modal_deleteTemplate = function (templateID) {
            $modalService.create({
                template: $translate.instant("template_remove_confirm") + "<strong>" + templateID + "</strong>",
                model: $scope,
                title: "template_remove",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "template_remove",
                    classes: "btn-danger",
                    action: function () {
                        var _this2 = this;
                        deleteTemplate(templateID).success(function () {
                            $notification.create("Removed Template", templateID).success();
                            _this2.close();
                        }).error(function (data, status) {
                            $notification.create("Remove Template failed", data.Detail).error();
                        });
                    }
                }]
            });
        };

        // poll for apps that are being deployed
        $scope.deployingServices = [];
        var lastPollResults = 0;


        // kick this controller off
        init();

        $scope.$on("$destroy", function () {
            resourcesFactory.unregisterAllPolls();
            servicesFactory.deactivate();
            poolsFactory.deactivate();
        });
    }]);
})();
"use strict";

/* globals controlplane: true */

/* ServiceDetailsController
 * Displays details of a specific service
 */
(function () {
    "use strict";

    controlplane.controller("ServiceDetailsController", ["$scope", "$q", "$routeParams", "$location", "resourcesFactory", "authService", "$modalService", "$translate", "$notification", "$timeout", "servicesFactory", "miscUtils", "hostsFactory", "poolsFactory", "CCUIState", "$cookies", function ($scope, $q, $routeParams, $location, resourcesFactory, authService, $modalService, $translate, $notification, $timeout, servicesFactory, utils, hostsFactory, poolsFactory, CCUIState, $cookies) {
        var makeEditableContext = function (context) {
            var editableContext = "";
            for (var key in context) {
                editableContext += key + " " + context[key] + "\n";
            }
            if (!editableContext) {
                editableContext = "";
            }
            return editableContext;
        };

        var makeStorableContext = function (context) {
            //turn editableContext into a JSON object
            var lines = context.split("\n"),
                storable = {};

            lines.forEach(function (line) {
                var delimitIndex, key, val;

                if (line !== "") {
                    delimitIndex = line.indexOf(" ");
                    if (delimitIndex !== -1) {
                        key = line.substr(0, delimitIndex);
                        val = line.substr(delimitIndex + 1);
                        storable[key] = val;
                    } else {
                        context[line] = "";
                    }
                }
            });

            return storable;
        };

        var init = function () {
            $scope.name = "servicedetails";
            $scope.params = $routeParams;

            $scope.breadcrumbs = [{ label: "breadcrumb_deployed", url: "/apps" }];

            $scope.publicEndpointsTable = {
                sorting: {
                    Name: "asc",
                    ServiceEndpoint: "asc"
                }
            };
            $scope.ipsTable = {
                sorting: {
                    ServiceName: "asc"
                }
            };
            $scope.configTable = {
                sorting: {
                    Filename: "asc"
                }
            };
            $scope.instancesTable = {
                sorting: {
                    "model.InstanceID": "asc"
                },
                // instead of watching for a change, always
                // reload at a specified interval
                watchExpression: (function () {
                    var last = new Date().getTime(),
                        now,
                        interval = 1000;

                    return function () {
                        now = new Date().getTime();
                        if (now - last > interval) {
                            last = now;
                            return now;
                        }
                    };
                })()
            };
            $scope.scheduledTasksTable = {
                sorting: {
                    Schedule: "asc"
                }
            };

            // servicesTable should not be sortable since it
            // is a hierarchy.
            $scope.servicesTable = {};

            // setup initial state
            $scope.services = {
                data: servicesFactory.serviceTree,
                mapped: servicesFactory.serviceMap,
                current: servicesFactory.get($scope.params.serviceId)
            };

            $scope.ips = {};
            $scope.pools = [];

            // if the current service changes, update
            // various service controller thingies
            $scope.$watch(function () {
                // if no current service is set, try to set one
                if (!$scope.services.current) {
                    $scope.services.current = servicesFactory.get($scope.params.serviceId);
                }

                if ($scope.services.current) {
                    return $scope.services.current.isDirty();
                } else {
                    // there is no current service
                    console.warn("current service not yet available");
                    return undefined;
                }
            }, $scope.update);

            hostsFactory.activate();
            hostsFactory.update();

            servicesFactory.activate();
            servicesFactory.update();

            poolsFactory.activate();
            poolsFactory.update();

            $scope.$on("$destroy", function () {
                servicesFactory.deactivate();
                hostsFactory.deactivate();
                poolsFactory.deactivate();
            });
        };

        var makeCrumbs = function (current) {
            var crumbs = [{
                label: current.name,
                itemClass: "active",
                id: current.id
            }];

            (function recurse(service) {
                if (service) {
                    crumbs.unshift({
                        label: service.name,
                        url: "/services/" + service.id,
                        id: service.id
                    });
                    recurse(service.parent);
                }
            })(current.parent);

            crumbs.unshift({
                label: "Applications",
                url: "/apps"
            });

            return crumbs;
        };

        // Ensure logged in
        authService.checkLogin($scope);
        $scope.resourcesFactory = resourcesFactory;
        $scope.hostsFactory = hostsFactory;

        $scope.defaultHostAlias = $location.host();
        if (utils.needsHostAlias($location.host())) {
            resourcesFactory.getHostAlias().success(function (data) {
                $scope.defaultHostAlias = data.hostalias;
            });
        }

        //add Public Endpoint data
        $scope.publicEndpoints = { add: {} };

        //add service endpoint data
        $scope.exportedServiceEndpoints = {};

        $scope.click_pool = function (id) {
            resourcesFactory.routeToPool(id);
        };

        $scope.click_host = function (id) {
            resourcesFactory.routeToHost(id);
        };


        $scope.modalAddPublicEndpoint = function () {
            // default public endpoint options
            $scope.publicEndpoints.add = {
                type: "vhost",
                app_ep: $scope.exportedServiceEndpoints.data[0],
                name: "",
                port: ""
            };

            // returns an error string if newPublicEndpoint's vhost is invalid
            var validateVHost = function (newPublicEndpoint) {
                var name = newPublicEndpoint.name;

                // if no port
                if (!name || !name.length) {
                    return "Missing Name";
                }

                // if name already exists
                for (var i in $scope.publicEndpoints.data) {
                    if (name === $scope.publicEndpoints.data[i].Name) {
                        return "Name already exists: " + newPublicEndpoint.name;
                    }
                }

                // if invalid characters
                var re = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;
                if (!re.test(name)) {
                    return $translate.instant("vhost_name_invalid") + " " + newPublicEndpoint.name;
                }
            };

            // returns an error string if newPublicEndpoint's port is invalid
            var validatePort = function (newPublicEndpoint) {
                var port = newPublicEndpoint.port;

                // if no port
                if (!port || !port.length) {
                    return "Missing port";
                }

                // if port already exists
                for (var i in $scope.publicEndpoints.data) {
                    if (+port === $scope.publicEndpoints.data[i].PortAddr) {
                        return "Port number already in use: " + newPublicEndpoint.port;
                    }
                }

                if (+port < 1024) {
                    return "Port must be greater than 1024";
                }
                if (+port > 65536) {
                    return "Port must be less than 65536";
                }

                // TODO - add more reserved ports
                var reservedPorts = [5000, 8080];
                if (reservedPorts.indexOf(+port) !== -1) {
                    return "Port " + port + " is reserved";
                }
            };

            $modalService.create({
                templateUrl: "add-public-endpoint.html",
                model: $scope,
                title: "add_public_endpoint",
                actions: [{
                    role: "cancel",
                    action: function () {
                        this.close();
                    }
                }, {
                    role: "ok",
                    label: "add_public_endpoint_confirm",
                    action: function () {
                        var newPublicEndpoint = $scope.publicEndpoints.add;

                        if (this.validate(newPublicEndpoint)) {
                            // disable ok button, and store the re-enable function
                            var enableSubmit = this.disableSubmitButton();

                            $scope.addPublicEndpoint(newPublicEndpoint).success((function (data, status) {
                                $notification.create("Added public endpoint").success();
                                this.close();
                            }).bind(this)).error((function (data, status) {
                                this.createNotification("Unable to add public endpoint", data.Detail).error();
                                enableSubmit();
                            }).bind(this));
                        }
                    }
                }],

                validate: function (newPublicEndpoint) {
                    // if no service endpoint selected
                    if (!newPublicEndpoint.app_ep) {
                        this.createNotification("Unable to add Public Endpoint", "No service endpoint selected").error();
                        return false;
                    }


                    // perform type specific validation
                    if (newPublicEndpoint.type === "vhost") {
                        var err = validateVHost(newPublicEndpoint);
                        if (err) {
                            this.createNotification("Unable to add Public Endpoint", err).error();
                        } else {
                            return true;
                        }
                    } else if (newPublicEndpoint.type === "port") {
                        var err = validatePort(newPublicEndpoint);
                        if (err) {
                            this.createNotification("Unable to add Public Endpoint", err).error();
                            return false;
                        } else {
                            return true;
                        }
                    }
                } });
        };


        $scope.addPublicEndpoint = function (newPublicEndpoint) {
            if (newPublicEndpoint.type === "vhost") {
                var name = newPublicEndpoint.name;
                var serviceId = newPublicEndpoint.app_ep.ApplicationId;
                var serviceEndpoint = newPublicEndpoint.app_ep.ServiceEndpoint;
                return resourcesFactory.addVHost(serviceId, serviceEndpoint, name);
            } else if (newPublicEndpoint.type === "port") {
                var port = newPublicEndpoint.port;
                var serviceId = newPublicEndpoint.app_ep.ApplicationId;
                var serviceEndpoint = newPublicEndpoint.app_ep.ServiceEndpoint;
                return resourcesFactory.addPort(serviceId, serviceEndpoint, port);
            }
        };

        // modalAssignIP opens a modal view to assign an ip address to a service
        $scope.modalAssignIP = function (ip, poolID) {
            $scope.ips.assign = { ip: ip, value: null };
            resourcesFactory.getPoolIPs(poolID).success(function (data) {
                var options = [{ Value: "Automatic", IPAddr: "" }];

                var i, IPAddr, value;
                //host ips
                if (data && data.HostIPs) {
                    for (i = 0; i < data.HostIPs.length; ++i) {
                        IPAddr = data.HostIPs[i].IPAddress;
                        value = "Host: " + IPAddr + " - " + data.HostIPs[i].InterfaceName;
                        options.push({ Value: value, IPAddr: IPAddr });
                        // set the default value to the currently assigned value
                        if ($scope.ips.assign.ip.IPAddr === IPAddr) {
                            $scope.ips.assign.value = options[options.length - 1];
                        }
                    }
                }

                //virtual ips
                if (data && data.VirtualIPs) {
                    for (i = 0; i < data.VirtualIPs.length; ++i) {
                        IPAddr = data.VirtualIPs[i].IP;
                        value = "Virtual IP: " + IPAddr;
                        options.push({ Value: value, IPAddr: IPAddr });
                        // set the default value to the currently assigned value
                        if ($scope.ips.assign.ip.IPAddr === IPAddr) {
                            $scope.ips.assign.value = options[options.length - 1];
                        }
                    }
                }

                //default to automatic
                if (!$scope.ips.assign.value) {
                    $scope.ips.assign.value = options[0];
                }
                $scope.ips.assign.options = options;

                $modalService.create({
                    templateUrl: "assign-ip.html",
                    model: $scope,
                    title: "assign_ip",
                    actions: [{
                        role: "cancel"
                    }, {
                        role: "ok",
                        label: "assign_ip",
                        action: function () {
                            if (this.validate()) {
                                // disable ok button, and store the re-enable function
                                var enableSubmit = this.disableSubmitButton();

                                $scope.assignIP().success((function (data, status) {
                                    $notification.create("Added IP", data.Detail).success();
                                    this.close();
                                }).bind(this)).error((function (data, status) {
                                    this.createNotification("Unable to Assign IP", data.Detail).error();
                                    enableSubmit();
                                }).bind(this));
                            }
                        }
                    }]
                });
            }).error(function (data, status) {
                $notification.create("Unable to retrieve IPs", data.Detail).error();
            });
        };

        $scope.anyServicesExported = function (service) {
            if (service) {
                for (var i in service.Endpoints) {
                    if (service.Endpoints[i].Purpose === "export") {
                        return true;
                    }
                }
                for (var j in service.children) {
                    if ($scope.anyServicesExported(service.children[j])) {
                        return true;
                    }
                }
            }
            return false;
        };


        $scope.assignIP = function () {
            var serviceID = $scope.ips.assign.ip.ServiceID;
            var IP = $scope.ips.assign.value.IPAddr;
            return resourcesFactory.assignIP(serviceID, IP).success(function (data, status) {
                // HACK: update(true) forces a full update to
                // work around issue https://jira.zenoss.com/browse/CC-939
                servicesFactory.update(true);
            });
        };


        $scope.publicEndpointURL = function (publicEndpoint) {
            if (publicEndpoint.type === "vhost") {
                var port = location.port === "" ? "" : ":" + location.port;
                var host = publicEndpoint.Name.indexOf(".") === -1 ? publicEndpoint.Name + "." + $scope.defaultHostAlias : publicEndpoint.Name;
                return location.protocol + "//" + host + port;
            } else if (publicEndpoint.type === "port") {
                if (publicEndpoint.PortAddr.startsWith(":")) {
                    var host = $scope.defaultHostAlias;
                    // Port public endpoint port listeners are always on http
                    return "http://" + host + publicEndpoint.PortAddr;
                } else {
                    return "http://" + publicEndpoint.PortAddr;
                }
            }
        };

        $scope.indent = function (depth) {
            return { "padding-left": 15 * depth + "px" };
        };

        // sets a service to start, stop or restart state
        $scope.setServiceState = function (service, state, skipChildren) {
            service[state](skipChildren).error(function (data, status) {
                $notification.create("Unable to " + state + " service", data.Detail).error();
            });
        };

        // filters to be used when counting how many descendent
        // services will be affected by a state change
        var serviceStateChangeFilters = {
            // only stopped services will be started
            start: function (service) {
                return service.desiredState === 0;
            },
            // only started services will be stopped
            stop: function (service) {
                return service.desiredState === 1;
            },
            // only started services will be restarted
            restart: function (service) {
                return service.desiredState === 1;
            }
        };

        // clicks to a service's start, stop, or restart
        // button should first determine if the service has
        // children and ask the user to choose to start all
        // children or only the top service
        $scope.clickRunning = function (service, state) {
            var filterFn = serviceStateChangeFilters[state];
            var childCount = utils.countTheKids(service, filterFn);

            // if the service has affected children, check if the user
            // wants to start just the service, or the service and children
            if (childCount > 0) {
                $scope.modal_confirmSetServiceState(service, state, childCount);

                // if no children, just start the service
            } else {
                $scope.setServiceState(service, state);
            }
            servicesFactory.updateHealth();
        };

        // verifies if use wants to start parent service, or parent
        // and all children
        $scope.modal_confirmSetServiceState = function (service, state, childCount) {
            $modalService.create({
                template: ["<h4>" + $translate.instant("choose_services_" + state) + "</h4><ul>", "<li>" + $translate.instant(state + "_service_name", { name: "<strong>" + service.name + "</strong>" }) + "</li>", "<li>" + $translate.instant(state + "_service_name_and_children", { name: "<strong>" + service.name + "</strong>", count: "<strong>" + childCount + "</strong>" }) + "</li></ul>"].join(""),
                model: $scope,
                title: $translate.instant(state + "_service"),
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    classes: " ",
                    label: $translate.instant(state + "_service"),
                    action: function () {
                        // the arg here explicitly prevents child services
                        // from being started
                        $scope.setServiceState(service, state, true);
                        this.close();
                    }
                }, {
                    role: "ok",
                    label: $translate.instant(state + "_service_and_children", { count: childCount }),
                    action: function () {
                        $scope.setServiceState(service, state);
                        this.close();
                    }
                }]
            });
        };


        $scope.clickEndpointEnable = function (publicEndpoint) {
            if (publicEndpoint.type === "vhost") {
                resourcesFactory.enableVHost(publicEndpoint.ApplicationId, publicEndpoint.ServiceEndpoint, publicEndpoint.Name).error(function (data, status) {
                    $notification.create("Enable Public Endpoint failed", data.Detail).error();
                });
            } else if (publicEndpoint.type === "port") {
                resourcesFactory.enablePort(publicEndpoint.ApplicationId, publicEndpoint.ServiceEndpoint, publicEndpoint.PortAddr).error(function (data, status) {
                    $notification.create("Enable Public Endpoint failed", data.Detail).error();
                });
            }
        };


        $scope.clickEndpointDisable = function (publicEndpoint) {
            if (publicEndpoint.type === "vhost") {
                resourcesFactory.disableVHost(publicEndpoint.ApplicationId, publicEndpoint.ServiceEndpoint, publicEndpoint.Name).error(function (data, status) {
                    $notification.create("Disable Public Endpoint failed", data.Detail).error();
                });
            } else if (publicEndpoint.type === "port") {
                resourcesFactory.disablePort(publicEndpoint.ApplicationId, publicEndpoint.ServiceEndpoint, publicEndpoint.PortAddr).error(function (data, status) {
                    $notification.create("Disable Public Endpoint failed", data.Detail).error();
                });
            }
        };

        $scope.clickEditContext = function () {
            //set editor options for context editing
            $scope.codemirrorOpts = {
                lineNumbers: true,
                mode: "properties"
            };

            $scope.editableService = angular.copy($scope.services.current.model);
            $scope.editableContext = makeEditableContext($scope.editableService.Context);

            $modalService.create({
                templateUrl: "edit-context.html",
                model: $scope,
                title: $translate.instant("edit_context"),
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: $translate.instant("btn_save_changes"),
                    action: function () {
                        // disable ok button, and store the re-enable function
                        var enableSubmit = this.disableSubmitButton();

                        $scope.editableService.Context = makeStorableContext($scope.editableContext);

                        $scope.updateService($scope.editableService).success((function (data, status) {
                            $notification.create("Updated service", $scope.editableService.ID).success();
                            this.close();
                        }).bind(this)).error((function (data, status) {
                            this.createNotification("Update service failed", data.Detail).error();
                            enableSubmit();
                        }).bind(this));
                    }
                }],
                onShow: function () {
                    $scope.codemirrorRefresh = true;
                },
                onHide: function () {
                    $scope.codemirrorRefresh = false;
                }
            });
        };




        $scope.clickRemovePublicEndpoint = function (publicEndpoint) {
            $modalService.create({
                template: $translate.instant("remove_public_endpoint") + ": <strong>" + (publicEndpoint.Name ? publicEndpoint.Name : "port " + publicEndpoint.PortAddr) + "</strong><br><br>" + "After the public endpoint is removed, the <strong>" + publicEndpoint.Application + "</strong> service will automatically be restarted.",
                model: $scope,
                title: "remove_public_endpoint",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "remove_public_endpoint_confirm",
                    classes: "btn-danger",
                    action: function () {
                        if (publicEndpoint.type === "vhost") {
                            resourcesFactory.removeVHost(publicEndpoint.ApplicationId, publicEndpoint.ServiceEndpoint, publicEndpoint.Name).success(function () {
                                servicesFactory.update();
                                $notification.create("Removed Public Endpoint", publicEndpoint.Name).success();
                            }).error(function (data, status) {
                                $notification.create("Remove Public Endpoint failed", data.Detail).error();
                            });
                        } else if (publicEndpoint.type === "port") {
                            resourcesFactory.removePort(publicEndpoint.ApplicationId, publicEndpoint.ServiceEndpoint, publicEndpoint.PortAddr).success(function () {
                                servicesFactory.update();
                                $notification.create("Removed Public Endpoint", publicEndpoint.PortName).success();
                            }).error(function (data, status) {
                                $notification.create("Remove Public Endpoint failed", data.Detail).error();
                            });
                        }
                        this.close();
                    }
                }]
            });
        };

        $scope.editConfig = function (config) {
            $scope.editableService = angular.copy($scope.services.current.model);
            $scope.selectedConfig = config;

            //set editor options for context editing
            $scope.codemirrorOpts = {
                lineNumbers: true,
                mode: utils.getModeFromFilename($scope.selectedConfig)
            };

            $modalService.create({
                templateUrl: "edit-config.html",
                model: $scope,
                title: $translate.instant("title_edit_config") + " - " + $scope.selectedConfig,
                bigModal: true,
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "save",
                    action: function () {
                        if (this.validate()) {
                            // disable ok button, and store the re-enable function
                            var enableSubmit = this.disableSubmitButton();

                            $scope.updateService($scope.editableService).success((function (data, status) {
                                $notification.create("Updated service", $scope.editableService.ID).success();
                                this.close();
                            }).bind(this)).error((function (data, status) {
                                this.createNotification("Update service failed", data.Detail).error();
                                enableSubmit();
                            }).bind(this));
                        }
                    }
                }],
                validate: function () {
                    // TODO - actually validate
                    return true;
                },
                onShow: function () {
                    $scope.codemirrorRefresh = true;
                },
                onHide: function () {
                    $scope.codemirrorRefresh = false;
                }
            });
        };

        $scope.viewLog = function (instance) {
            $scope.editService = angular.copy(instance);

            resourcesFactory.getInstanceLogs(instance.model.ServiceID, instance.model.ID).success(function (log) {
                $scope.editService.log = log.Detail;
                $modalService.create({
                    templateUrl: "view-log.html",
                    model: $scope,
                    title: "title_log",
                    bigModal: true,
                    actions: [{
                        role: "cancel",
                        label: "close"
                    }, {
                        classes: "btn-primary",
                        label: "refresh",
                        icon: "glyphicon-repeat",
                        action: function () {
                            var _this = this;
                            var textarea = this.$el.find("textarea");
                            resourcesFactory.getInstanceLogs(instance.model.ServiceID, instance.id).success(function (log) {
                                $scope.editService.log = log.Detail;
                                textarea.scrollTop(textarea[0].scrollHeight - textarea.height());
                            }).error(function (data, status) {
                                _this.createNotification("Unable to fetch logs", data.Detail).error();
                            });
                        }
                    }, {
                        classes: "btn-primary",
                        label: "download",
                        action: function () {
                            utils.downloadFile("/services/" + instance.model.ServiceID + "/" + instance.model.ID + "/logs/download");
                        },
                        icon: "glyphicon-download"
                    }],
                    onShow: function () {
                        var textarea = this.$el.find("textarea");
                        textarea.scrollTop(textarea[0].scrollHeight - textarea.height());
                    }
                });
            }).error(function (data, status) {
                $notification.create("Unable to fetch logs", data.Detail).error();
            });
        };

        $scope.validateService = function () {
            // TODO: Validate name and startup command
            var svc = $scope.services.current.model,
                max = svc.InstanceLimits.Max,
                min = svc.InstanceLimits.Min,
                num = svc.Instances;
            if (typeof num === "undefined" || max > 0 && num > max || min > 0 && num < min) {
                var msg = $translate.instant("instances_invalid") + " ";
                if (min > 0) {
                    msg += $translate.instant("minimum") + " " + min;
                    if (max > 0) {
                        msg += ", ";
                    }
                }
                if (max > 0) {
                    msg += $translate.instant("maximum") + " " + max;
                }
                $notification.create("", msg).error();
                return false;
            }
            return true;
        };

        $scope.updateService = function (newService) {
            var _this2 = this;
            if ($scope.validateService()) {
                return resourcesFactory.updateService($scope.services.current.model.ID, newService).success(function (data, status) {
                    servicesFactory.update();
                    _this2.editableService = {};
                });
            }
        };

        $scope.subNavClick = function (crumb) {
            if (crumb.id) {
                $scope.routeToService(crumb.id);
            } else {
                // TODO - just call subnavs usual function
                $location.path(crumb.url);
            }
        };

        $scope.routeToService = function (id, e) {
            // if an event is present, we may
            // need to prevent it from performing
            // default navigation behavior
            if (e) {
                // ctrl click opens in new tab,
                // so allow that to happen and don't
                // bother routing the current view
                if (e.ctrlKey) {
                    return;
                }

                // if middle click, don't update
                // current view
                if (e.button === 1) {
                    return;
                }

                // otherwise, prevent default so
                // we can handle the view routing
                e.preventDefault();
            }

            $location.update_path("/services/" + id, true);
            $scope.params.serviceId = id;
            $scope.services.current = servicesFactory.get($scope.params.serviceId);
            $scope.update();
        };

        $scope.isServiceRunning = function (id) {
            var service = servicesFactory.get(id);
            return service.desiredState === 1;
        };

        $scope.update = function () {
            if ($scope.services.current) {
                $scope.services.subservices = $scope.services.current.descendents;
                $scope.publicEndpoints.data = $scope.services.current.publicEndpoints;
                $scope.exportedServiceEndpoints.data = $scope.services.current.exportedServiceEndpoints;
                $scope.ips.data = $scope.services.current.addresses;

                // update instances
                $scope.services.current.getServiceInstances();

                // setup breadcrumbs
                $scope.breadcrumbs = makeCrumbs($scope.services.current);

                // update serviceTreeState
                $scope.serviceTreeState = CCUIState.get($cookies.ZUsername, "serviceTreeState");

                // update pools
                $scope.pools = poolsFactory.poolList;

                // create an entry in tree state for the
                // current service
                if (!($scope.services.current.id in $scope.serviceTreeState)) {
                    $scope.serviceTreeState[$scope.services.current.id] = {};

                    var treeState = $scope.serviceTreeState[$scope.services.current.id];

                    // create default entries from all descendents
                    $scope.services.current.descendents.forEach(function (descendent) {
                        // TODO - formalize this state object
                        treeState[descendent.id] = {
                            hidden: false,
                            collapsed: false
                        };
                    });
                }

                // property for view to bind for tree state
                $scope.services.currentTreeState = $scope.serviceTreeState[$scope.services.current.id];
            }

            servicesFactory.updateHealth();
        };

        // restart all running instances for this service
        $scope.killRunningInstances = function (app) {
            resourcesFactory.restartService(app.ID).error(function (data, status) {
                $notification.create("Stop Service failed", data.Detail).error();
            });
        };

        $scope.startTerminal = function (app) {
            window.open("http://" + window.location.hostname + ":50000");
        };



        $scope.getHostName = function (id) {
            if (hostsFactory.get(id)) {
                return hostsFactory.get(id).name;
            } else {
                // TODO - if unknown host, dont make linkable
                // and use custom css to show unknown
                return "unknown";
            }
        };

        // expand/collapse state of service tree nodes
        $scope.serviceTreeState = CCUIState.get($cookies.ZUsername, "serviceTreeState");
        // servicedTreeState is a collection of objects
        // describing if nodes in a service tree are hidden or collapsed.
        // It is first keyed by the id of the current service context (the
        // service who's name is at the top of the page), then keyed by
        // the service in question. eg:
        //
        // current service id
        //      -> child service id
        //          -> hidden
        //          -> collapsed
        //      -> child service id
        //          -> hidden
        //          -> collapsed
        //      ...

        $scope.toggleChildren = function (service) {
            if (!$scope.services.current) {
                console.warn("Cannot store toggle state: no current service");
                return;
            }

            // stored state for the current service's
            // service tree
            var treeState = $scope.services.currentTreeState;

            // if this service is marked as collapsed in
            // this particular tree view, show its children
            if (treeState[service.id].collapsed) {
                treeState[service.id].collapsed = false;
                $scope.showChildren(service);

                // otherwise, hide its children
            } else {
                treeState[service.id].collapsed = true;
                $scope.hideChildren(service);
            }
        };

        $scope.hideChildren = function (service) {
            // get the state of the current service's tree
            var treeState = $scope.services.currentTreeState;

            service.children.forEach(function (child) {
                treeState[child.id].hidden = true;
                $scope.hideChildren(child);
            });
        };

        $scope.showChildren = function (service) {
            var treeState = $scope.services.currentTreeState;

            service.children.forEach(function (child) {
                treeState[child.id].hidden = false;

                // if this child service is not marked
                // as collapsed, show its children
                if (!treeState[child.id].collapsed) {
                    $scope.showChildren(child);
                }
            });
        };

        //we need to bring this function into scope so we can use ng-hide if an object is empty
        $scope.isEmptyObject = function (obj) {
            return angular.equals({}, obj);
        };

        $scope.isIsvc = function (service) {
            return service.isIsvc();
        };

        $scope.hasCurrentInstances = function () {
            return $scope.services && $scope.services.current && $scope.services.current.hasInstances();
        };

        $scope.editCurrentService = function () {
            // clone service for editing
            $scope.editableService = angular.copy($scope.services.current.model);

            $modalService.create({
                templateUrl: "edit-service.html",
                model: $scope,
                title: "title_edit_service",
                actions: [{
                    role: "cancel"
                }, {
                    role: "ok",
                    label: "btn_save_changes",
                    action: function () {
                        if (this.validate()) {
                            // disable ok button, and store the re-enable function
                            var enableSubmit = this.disableSubmitButton();

                            // update service with recently edited service
                            $scope.updateService($scope.editableService).success((function (data, status) {
                                $notification.create("Updated service", $scope.editableService.ID).success();
                                this.close();
                            }).bind(this)).error((function (data, status) {
                                this.createNotification("Update service failed", data.Detail).error();
                                enableSubmit();
                            }).bind(this));
                        }
                    }
                }],
                validate: function () {
                    if ($scope.editableService.InstanceLimits.Min > $scope.editableService.Instances || $scope.editableService.Instances === undefined) {
                        return false;
                    }

                    return true;
                }
            });
        };

        // TODO - clean up magic numbers
        $scope.calculateIndent = function (service) {
            var indent = service.depth,
                offset = 1;

            if ($scope.services.current && $scope.services.current.parent) {
                offset = $scope.services.current.parent.depth + 2;
            }

            return $scope.indent(indent - offset);
        };


        // kick off controller
        init();


    }]);
})();
"use strict";

// servicesFactory
// - maintains a list of services and keeps it in sync with the backend.
// - links services with their parents and children
// - aggregates and caches service information (such as descendents)
(function () {
    "use strict";

    var sortServicesByName = function (a, b) {
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    };

    // Service object constructor
    // takes a service object (backend service object)
    // and wraps it with extra functionality and info
    var Service = function (service, parent) {
        this.parent = parent;
        this.children = [];
        this.instances = [];

        // tree depth
        this.depth = 0;

        // cache for computed values
        this.cache = new Cache(["addresses", "descendents", "publicEndpoints", "exportedServiceEndpoints"]);

        this.resources = {
            RAMCommitment: 0,
            RAMAverage: 0
        };

        this.update(service);

        // this newly created child should be
        // registered with its parent
        // TODO - this makes parent update twice...
        if (this.parent) {
            this.parent.addChild(this);
        }
    };

    // simple cache object
    // TODO - angular has this sorta stuff built in
    var Cache = function (caches) {
        this.caches = {};
        if (caches) {
            caches.forEach((function (name) {
                this.addCache(name);
            }).bind(this));
        }
    };

    var resourcesFactory, $q, serviceHealth, instancesFactory, utils;

    angular.module("servicesFactory", []).factory("servicesFactory", ["$rootScope", "$q", "resourcesFactory", "$interval", "$serviceHealth", "instancesFactory", "baseFactory", "miscUtils", function ($rootScope, q, _resourcesFactory, $interval, _serviceHealth, _instancesFactory, BaseFactory, _utils) {
        // share resourcesFactory throughout
        resourcesFactory = _resourcesFactory;
        instancesFactory = _instancesFactory;
        serviceHealth = _serviceHealth;
        utils = _utils;
        $q = q;

        var UPDATE_PADDING = 1000;

        var newFactory = new BaseFactory(Service, resourcesFactory.getServices);

        // alias some stuff for ease of use
        newFactory.serviceTree = newFactory.objArr;
        newFactory.serviceMap = newFactory.objMap;

        angular.extend(newFactory, {
            // TODO - update list by application instead
            // of all services ever?
            update: function (force, skipUpdateInstances) {
                var _this = this;
                var deferred = $q.defer(),
                    now = new Date().getTime(),
                    requestTime = now,
                    since;

                // if this is the first update, request
                // all services
                if (this.lastRequest === undefined || force) {
                    since = 0;

                    // request all data since the last request
                    // was made to ensure any new data that came
                    // in DURING the request is filled
                } else {
                    since = now - this.lastRequest + UPDATE_PADDING;
                }

                resourcesFactory.getServices(since).success(function (data, status) {
                    // TODO - change backend to send
                    // updated, created, and deleted
                    // separately from each other
                    data.forEach(function (serviceDef) {
                        var currentParent, service;

                        // update
                        if (_this.serviceMap[serviceDef.ID]) {
                            service = _this.serviceMap[serviceDef.ID];
                            currentParent = service.parent;

                            // if the service parent has changed,
                            // update its tree stuff (parent, depth, etc)
                            if (currentParent && serviceDef.ParentServiceID !== service.parent.id) {
                                _this.serviceMap[serviceDef.ID].update(serviceDef);
                                _this.addServiceToTree(service);

                                // otherwise, just update the service
                            } else {
                                _this.serviceMap[serviceDef.ID].update(serviceDef);
                            }

                            // new
                        } else {
                            _this.serviceMap[serviceDef.ID] = new Service(serviceDef);
                            _this.addServiceToTree(_this.serviceMap[serviceDef.ID]);
                        }

                        // TODO - deleted service
                    });

                    // check to see if orphans found parents
                    for (var id in _this.serviceMap) {
                        if (_this.serviceMap[id].isOrphan) {
                            _this.addServiceToTree(_this.serviceMap[id]);
                        }
                    }

                    // HACK - services should update themselves?
                    _this.updateHealth();

                    // notify the first services request is done
                    $rootScope.$emit("ready");

                    // time last SUCCESSFUL request began
                    _this.lastRequest = requestTime;
                    _this.lastUpdate = new Date().getTime();

                    deferred.resolve();
                });

                // keep instances up to date
                if (!skipUpdateInstances) {
                    instancesFactory.update();
                }

                return deferred.promise;
            },

            // adds a service object to the service tree
            // in the appropriate place
            addServiceToTree: function (service) {
                var parent;
                // if this is not a top level service
                if (service.model.ParentServiceID) {
                    parent = this.serviceMap[service.model.ParentServiceID];

                    // if the parent isn't available, mark
                    // as an orphaned service and early return
                    if (!parent) {
                        service.isOrphan = true;
                        return;
                    }

                    service.isOrphan = false;

                    parent.addChild(service);

                    // if this is a top level service
                } else {
                    this.serviceTree.push(service);
                    //this.serviceTree.sort(sortServicesByName);
                }

                // ICKY GROSS HACK!
                // iterate tree and store tree depth on
                // individual services
                // TODO - find a more elegant way to keep track of depth
                // TODO - remove apps from service tree if they get a parent
                this.serviceTree.forEach(function (topService) {
                    topService.depth = 0;
                    topService.children.forEach(function recurse(service) {
                        service.depth = service.parent.depth + 1;
                        service.children.forEach(recurse);
                    });
                });
            },

            // TODO - debounce this guy
            updateHealth: function () {
                var statuses = serviceHealth.update(this.serviceMap);
                for (var id in statuses) {
                    // attach status to associated service
                    if (this.serviceMap[id]) {
                        this.serviceMap[id].status = statuses[id];
                    }
                }
            }
        });

        return newFactory;
    }]);




    // service types
    // internal service
    var ISVC = "isvc",

    // a service with no parent
    APP = "app",

    // a service with children but no
    // startup command
    META = "meta",

    // a service who's parent is still
    // being deployed
    DEPLOYING = "deploying";

    // DesiredState enum
    var START = 1,
        STOP = 0,
        RESTART = -1;

    Service.prototype = {
        constructor: Service,

        // updates the immutable service object
        // and marks any computed properties dirty
        update: function (service) {
            if (service) {
                this.updateServiceDef(service);
            }

            // update service health
            // TODO - should service update itself, its controller
            // update the service, or serviceHealth update all services?
            this.status = serviceHealth.get(this.id);

            this.evaluateServiceType();

            // invalidate caches
            this.markDirty();

            // notify parent that this is now dirty
            if (this.parent) {
                this.parent.update();
            }
        },

        updateServiceDef: function (service) {
            // these properties are for convenience
            this.name = service.Name;
            this.id = service.ID;
            // NOTE: desiredState is mutable to improve UX
            this.desiredState = service.DesiredState;

            // make service immutable
            this.model = Object.freeze(service);
        },

        // invalidate all caches. This is needed
        // when descendents update
        markDirty: function () {
            this.cache.markAllDirty();
        },

        evaluateServiceType: function () {
            // infer service type
            this.type = [];
            if (this.model.ID.indexOf("isvc-") !== -1) {
                this.type.push(ISVC);
            }

            if (!this.model.ParentServiceID) {
                this.type.push(APP);
            }

            if (this.children.length && !this.model.Startup) {
                this.type.push(META);
            }

            if (this.parent && this.parent.isDeploying()) {
                this.type.push(DEPLOYING);
            }
        },

        addChild: function (service) {
            // if this service is not already in the list
            if (this.children.indexOf(service) === -1) {
                this.children.push(service);

                // make sure this child knows who
                // its parent is
                service.setParent(this);

                // alpha sort children
                this.children.sort(sortServicesByName);

                this.update();
            }
        },

        removeChild: function (service) {
            var childIndex = this.children.indexOf(service);

            if (childIndex !== -1) {
                this.children.splice(childIndex, 1);
            }
            this.update();
        },

        setParent: function (service) {
            // if this is already the parent, IM OUT!
            if (this.parent === service) {
                return;
            }

            // if a parent is already set, remove
            // this service from its childship
            if (this.parent) {
                this.parent.removeChild(this);
            }

            this.parent = service;
            this.parent.addChild(this);
            this.update();
        },

        // start, stop, or restart this service
        start: function (skipChildren) {
            var _this2 = this;
            var promise = resourcesFactory.startService(this.id, skipChildren),
                oldDesiredState = this.desiredState;

            this.desiredState = START;

            // if something breaks, return desired
            // state to its previous value
            return promise.error(function () {
                _this2.desiredState = oldDesiredState;
            });
        },
        stop: function (skipChildren) {
            var _this3 = this;
            var promise = resourcesFactory.stopService(this.id, skipChildren),
                oldDesiredState = this.desiredState;

            this.desiredState = STOP;

            // if something breaks, return desired
            // state to its previous value
            return promise.error(function () {
                _this3.desiredState = oldDesiredState;
            });
        },
        restart: function (skipChildren) {
            var _this4 = this;
            var promise = resourcesFactory.restartService(this.id, skipChildren),
                oldDesiredState = this.desiredState;

            this.desiredState = RESTART;

            // if something breaks, return desired
            // state to its previous value
            return promise.error(function () {
                _this4.desiredState = oldDesiredState;
            });
        },

        // gets a list of running instances of this service.
        // NOTE: this isn't using a cache because this can be
        // invalidated at any time, so it should always be checked
        getServiceInstances: function () {
            this.instances = instancesFactory.getByServiceId(this.id);
            this.instances.sort(function (a, b) {
                return a.model.InstanceID > b.model.InstanceID;
            });
            return this.instances;
        },

        resourcesGood: function () {
            var instances = this.getServiceInstances();
            for (var i = 0; i < instances.length; i++) {
                if (!instances[i].resourcesGood()) {
                    return false;
                }
            }
            return true;
        },

        // some convenience methods
        isIsvc: function () {
            return !! ~this.type.indexOf(ISVC);
        },

        isApp: function () {
            return !! ~this.type.indexOf(APP);
        },

        isDeploying: function () {
            return !! ~this.type.indexOf(DEPLOYING);
        },

        // HACK: this is a temporary fix to mark
        // services deploying.
        markDeploying: function () {
            this.type.push(DEPLOYING);
        },

        // if any cache is dirty, this whole object
        // is dirty
        isDirty: function () {
            return this.cache.anyDirty();
        },

        hasInstances: function () {
            return !!this.instances.length;
        }
    };

    Object.defineProperty(Service.prototype, "descendents", {
        get: function () {
            var descendents = this.cache.getIfClean("descendents");

            if (descendents) {
                return descendents;
            }

            descendents = this.children.reduce(function (acc, child) {
                acc.push(child);
                return acc.concat(child.descendents);
            }, []);

            Object.freeze(descendents);
            this.cache.cache("descendents", descendents);
            return descendents;
        }
    });

    Object.defineProperty(Service.prototype, "addresses", {
        get: function () {
            var addresses = this.cache.getIfClean("addresses");

            // if valid cache, early return it
            if (addresses) {
                return addresses;
            }

            // otherwise, get some new data
            var services = this.descendents.slice();

            // we also want to see the Endpoints for this
            // service, so add it to the list
            services.push(this);

            // iterate services
            addresses = services.reduce(function (acc, service) {
                var result = [];

                // if Endpoints, iterate Endpoints
                if (service.model.Endpoints) {
                    result = service.model.Endpoints.reduce(function (acc, endpoint) {
                        if (endpoint.AddressConfig.Port > 0 && endpoint.AddressConfig.Protocol) {
                            acc.push({
                                ID: endpoint.AddressAssignment.ID,
                                AssignmentType: endpoint.AddressAssignment.AssignmentType,
                                EndpointName: endpoint.AddressAssignment.EndpointName,
                                IPAddr: endpoint.AddressAssignment.IPAddr,
                                Port: endpoint.AddressConfig.Port,
                                HostID: endpoint.AddressAssignment.HostID,
                                PoolID: service.model.PoolID,
                                ServiceID: service.id,
                                ServiceName: service.name
                            });
                        }
                        return acc;
                    }, []);
                }

                return acc.concat(result);
            }, []);

            Object.freeze(addresses);
            this.cache.cache("addresses", addresses);
            return addresses;
        }
    });

    // fetch public endpoints for service and all descendents
    Object.defineProperty(Service.prototype, "publicEndpoints", {
        get: function () {
            var publicEndpoints = this.cache.getIfClean("publicEndpoints");

            // if valid cache, early return it
            if (publicEndpoints) {
                return publicEndpoints;
            }

            // otherwise, get some data
            var services = this.descendents.slice();

            // we also want to see the Endpoints for this
            // service, so add it to the list
            services.push(this);

            // iterate services
            publicEndpoints = services.reduce(function (acc, service) {
                var result = [];

                // if Endpoints, iterate Endpoints
                if (service.model.Endpoints) {
                    result = service.model.Endpoints.reduce(function (acc, endpoint) {
                        // if VHosts, iterate VHosts
                        if (endpoint.VHostList) {
                            endpoint.VHostList.forEach(function (VHost) {
                                acc.push({
                                    Name: VHost.Name,
                                    Enabled: VHost.Enabled,
                                    Application: service.name,
                                    ServiceEndpoint: endpoint.Application,
                                    ApplicationId: service.id,
                                    Value: service.name + " - " + endpoint.Application,
                                    type: "vhost" });
                            });
                        }
                        // if ports, iterate ports
                        if (endpoint.PortList) {
                            endpoint.PortList.forEach(function (port) {
                                acc.push({
                                    PortAddr: port.PortAddr,
                                    Enabled: port.Enabled,
                                    Application: service.name,
                                    ServiceEndpoint: endpoint.Application,
                                    ApplicationId: service.id,
                                    Value: service.name + " - " + endpoint.Application,
                                    type: "port" });
                            });
                        }

                        return acc;
                    }, []);
                }

                return acc.concat(result);
            }, []);

            Object.freeze(publicEndpoints);
            this.cache.cache("publicEndpoints", publicEndpoints);
            return publicEndpoints;
        }
    });

    // fetch public endpoints for service and all descendents
    Object.defineProperty(Service.prototype, "exportedServiceEndpoints", {
        get: function () {
            var exportedServiceEndpoints = this.cache.getIfClean("exportedServiceEndpoints");

            // if valid cache, early return it
            if (exportedServiceEndpoints) {
                return exportedServiceEndpoints;
            }

            // otherwise, get some data
            var services = this.descendents.slice();

            // we also want to see the Endpoints for this
            // service, so add it to the list
            services.push(this);

            // iterate services
            exportedServiceEndpoints = services.reduce(function (acc, service) {
                var result = [];

                // if Endpoints, iterate Endpoints
                if (service.model.Endpoints) {
                    result = service.model.Endpoints.reduce(function (acc, endpoint) {
                        // if this exports tcp, add it to our list.
                        if (endpoint.Purpose === "export" && endpoint.Protocol === "tcp") {
                            acc.push({
                                Application: service.name,
                                ServiceEndpoint: endpoint.Application,
                                ApplicationId: service.id,
                                Value: service.name + " - " + endpoint.Application });
                        }

                        return acc;
                    }, []);
                }

                return acc.concat(result);
            }, []);

            Object.freeze(exportedServiceEndpoints);
            this.cache.cache("exportedServiceEndpoints", exportedServiceEndpoints);
            return exportedServiceEndpoints;
        }
    });
    Cache.prototype = {
        constructor: Cache,
        addCache: function (name) {
            this.caches[name] = {
                data: null,
                dirty: false
            };
        },
        markDirty: function (name) {
            this.mark(name, true);
        },
        markAllDirty: function () {
            for (var key in this.caches) {
                this.markDirty(key);
            }
        },
        markClean: function (name) {
            this.mark(name, false);
        },
        markAllClean: function () {
            for (var key in this.caches) {
                this.markClean(key);
            }
        },
        cache: function (name, data) {
            this.caches[name].data = data;
            this.caches[name].dirty = false;
        },
        get: function (name) {
            return this.caches[name].data;
        },
        getIfClean: function (name) {
            if (!this.caches[name].dirty) {
                return this.caches[name].data;
            }
        },
        mark: function (name, flag) {
            this.caches[name].dirty = flag;
        },
        isDirty: function (name) {
            return this.caches[name].dirty;
        },
        anyDirty: function () {
            for (var i in this.caches) {
                if (this.caches[i].dirty) {
                    return true;
                }
            }
            return false;
        }
    };

})();
"use strict";

/* globals controlplane: true, dagreD3: true */

/* ServicesMapController
 * Displays dagre graph of services to hosts
 */
(function () {
    "use strict";

    controlplane.controller("ServicesMapController", ["$scope", "$location", "$routeParams", "authService", "resourcesFactory", "servicesFactory", "miscUtils", "hostsFactory", "instancesFactory", "$q", function ($scope, $location, $routeParams, authService, resourcesFactory, servicesFactory, utils, hostsFactory, instancesFactory, $q) {
        // Ensure logged in
        authService.checkLogin($scope);

        $scope.name = "servicesmap";
        $scope.params = $routeParams;

        $scope.breadcrumbs = [{ label: "breadcrumb_deployed", url: "/apps" }, { label: "breadcrumb_services_map", itemClass: "active" }];

        // flag if this is the first time the service
        // map has been updated
        var isFirstTime = true;
        $scope.refreshFrequency = 30000;

        var g = new dagreD3.graphlib.Graph();
        g.setGraph({
            nodesep: 10,
            ranksep: 75,
            rankdir: "LR"
        });
        var svg = d3.select(".service_map");
        var inner = svg.select("g");
        var render = new dagreD3.render();

        svg.height = $(".service_map").height();

        // Add zoom behavior
        var zoom = d3.behavior.zoom().on("zoom", function () {
            var ev = d3.event;
            inner.attr("transform", "translate(" + ev.translate + ") scale(" + ev.scale + ")");
        });
        svg.call(zoom);

        var draw = function (services, instances, isUpdate) {
            var nodes = [];
            var edges = [];
            var nodeClasses = {};

            // create service nodes and links
            for (var serviceId in services) {
                var service = services[serviceId];

                // if this is an isvc, dont add it
                if (service.isIsvc()) {
                    continue;
                }

                // add this service to the list of service nodes
                nodes.push({
                    id: service.id,
                    config: {
                        label: service.name,
                        "class": "service",
                        paddingTop: 6, paddingBottom: 6,
                        paddingLeft: 8, paddingRight: 8
                    }
                });

                // if this service has a parent, add it to the
                // list of edges
                if (service.model.ParentServiceID !== "") {
                    // if this service has a parent, mark its
                    // parent as meta
                    nodeClasses[service.model.ParentServiceID] = "service meta";

                    // link this service to its parent
                    edges.push({
                        source: service.model.ParentServiceID,
                        target: serviceId,
                        config: {
                            lineInterpolate: "basis"
                        }
                    });
                }
            }

            // link services to hosts
            for (var i = 0; i < instances.length; i++) {
                var running = instances[i];
                // if this running service has a HostID
                if (running.model.HostID) {
                    // if this host isnt in the list of hosts
                    if (!nodeClasses[running.model.HostID]) {
                        // add the host the the graph
                        nodes.push({
                            id: running.model.HostID,
                            config: {
                                label: hostsFactory.get(running.model.HostID).name,
                                "class": "host",
                                paddingTop: 6, paddingBottom: 6,
                                paddingLeft: 8, paddingRight: 8,
                                // round corners to distinguish
                                // from services
                                rx: 10,
                                ry: 10
                            }
                        });

                        // mark this node as a host
                        nodeClasses[running.model.HostID] = "host";
                    }

                    // mark running service
                    nodeClasses[running.model.ServiceID] = "service running " + running.status.status;

                    // create a link from this service to the host
                    // link this service to its parent
                    edges.push({
                        source: running.model.ServiceID,
                        target: running.model.HostID,
                        config: {
                            lineInterpolate: "basis"
                        }
                    });
                }
            }

            if (edges.length && nodes.length) {
                // attach all the cool stuff we just made
                // to the graph
                edges.forEach(function (edge) {
                    g.setEdge(edge.source, edge.target, edge.config);
                });
                nodes.forEach(function (node) {
                    if (nodeClasses[node.id]) {
                        node.config["class"] = nodeClasses[node.id];
                    }
                    g.setNode(node.id, node.config);
                });

                render(inner, g);

                if (isFirstTime) {
                    isFirstTime = false;
                    // Zoom and scale to fit
                    var zoomScale = zoom.scale();
                    var padding = 200;
                    var graphWidth = g.graph().width + padding;
                    var graphHeight = g.graph().height + padding;
                    var width = parseInt(svg.style("width").replace(/px/, ""));
                    var height = parseInt(svg.style("height").replace(/px/, ""));
                    zoomScale = Math.min(width / graphWidth, height / graphHeight);
                    var translate = [width / 2 - graphWidth * zoomScale / 2 + padding * zoomScale / 2, height / 2 - graphHeight * zoomScale / 2 + padding * zoomScale / 2];

                    zoom.translate(translate);
                    zoom.scale(zoomScale);
                    zoom.event(isUpdate ? svg.transition().duration(500) : d3.select("svg"));
                }

                // hide messages
                $(".service_map_loader").fadeOut(150);
            } else {
                // show "no services" message
                $(".service_map_loader.loading").hide();
                $(".service_map_loader.no_services").show();
            }
        };

        $scope.update = function () {
            return $q.all([hostsFactory.update(), servicesFactory.update(true, true), instancesFactory.update()]).then(function () {
                draw(servicesFactory.serviceMap, instancesFactory.instanceArr);
                $scope.lastUpdate = new Date();
            });
        };

        $scope.pollUpdate = function () {
            $scope.update().then(function () {
                setTimeout(function () {
                    $scope.pollUpdate();
                }, $scope.refreshFrequency);
            });
        };

        $scope.pollUpdate();
    }]);
})();
"use strict";

var _prototypeProperties = function (child, staticProps, instanceProps) {
    if (staticProps) Object.defineProperties(child, staticProps);
    if (instanceProps) Object.defineProperties(child.prototype, instanceProps);
};

/* CCUIState.js
 * preserve state through ui navigations
 */
(function () {
    "use strict";

    // TODO - persist to local storage
    var CCUIState = (function () {
        function CCUIState() {
            // -> user name
            //    -> store name
            //       -> stored object
            this.store = {};
        }

        _prototypeProperties(CCUIState, null, {
            get: {
                value: function get(userName, storeName) {
                    var userStore = this.getUserStore(userName);

                    // if the store doesnt exist for this user,
                    // create it
                    if (!userStore[storeName]) {
                        // TODO - formalize creation of this object
                        userStore[storeName] = {};
                    }

                    return userStore[storeName];
                },
                writable: true,
                enumerable: true,
                configurable: true
            },
            getUserStore: {

                // creates and returns a user store for the specified
                // user, or returns existing user store for the user
                value: function getUserStore(name) {
                    var users = Object.keys(this.store);

                    // if this user doesn't have a store,
                    // create one
                    if (users.indexOf(name) === -1) {
                        this.store[name] = {};
                    }

                    return this.store[name];
                },
                writable: true,
                enumerable: true,
                configurable: true
            }
        });

        return CCUIState;
    })();

    angular.module("CCUIState", []).service("CCUIState", [CCUIState]);
})();
"use strict";

/* authService.js
 * determine if user is authorized
 */
(function () {
    "use strict";

    angular.module("authService", []).factory("authService", ["$cookies", "$cookieStore", "$location", "$http", "$notification", "miscUtils", function ($cookies, $cookieStore, $location, $http, $notification, utils) {
        var loggedIn = false;
        var userName = null;

        var setLoggedIn = function (truth, username) {
            loggedIn = truth;
            userName = username;
        };
        return {

            /*
             * Called when we have positively determined that a user is or is not
             * logged in.
             *
             * @param {boolean} truth Whether the user is logged in.
             */
            setLoggedIn: setLoggedIn,

            login: function (creds, successCallback, failCallback) {
                $http.post("/login", creds).success(function (data, status) {
                    // Ensure that the auth service knows that we are logged in
                    setLoggedIn(true, creds.Username);

                    successCallback();
                }).error(function (data, status) {
                    // Ensure that the auth service knows that the login failed
                    setLoggedIn(false);

                    failCallback();
                });
            },

            logout: function () {
                $http["delete"]("/login").success(function (data, status) {
                    // On successful logout, redirect to /login
                    $location.path("/login");
                }).error(function (data, status) {
                    // On failure to logout, note the error
                    // TODO error screen
                    console.error("Unable to log out. Were you logged in to begin with?");
                });
            },

            /*
             * Check whether the user appears to be logged in. Update path if not.
             *
             * @param {object} scope The 'loggedIn' property will be set if true
             */
            checkLogin: function ($scope) {
                $scope.dev = $cookieStore.get("ZDevMode");
                if (loggedIn) {
                    $scope.loggedIn = true;
                    $scope.user = {
                        username: $cookies.ZUsername
                    };
                    return;
                }
                if ($cookies.ZCPToken) {
                    loggedIn = true;
                    $scope.loggedIn = true;
                    $scope.user = {
                        username: $cookies.ZUsername
                    };
                } else {
                    utils.unauthorized($location);
                }
            }
        };
    }]);
})();
"use strict";

/*
 * baseFactory.js
 * baseFactory constructs a factory object that can be used
 * to keep the UI in sync with the backend. The returned factory
 * will use the provided update function (which should return a
 * promise good for an map of id to object), create new objects using
 * the provided ObjConstructor, and cache those objects.
 *
 * When it hits the update function again, it will compare the new
 * list to the cached list and intelligently new, update, and
 * remove objects as needed.
 *
 * NOTE: you can override update, mixin methods, etc to make this
 * thing more useful
 */

(function () {
    "use strict";

    // BaseFactory creates and returns a new factory/cache
    // @param {function} ObjConstructor - constructor function to be new'd up
    //      with each object from the backend. NOTE: ObjConstructor must provide
    //      update and updateObjDef methods.
    // @param {function} updateFn - function to be called to update the object
    //      cache. NOTE: this function must return a promise that yields a map
    //      of id to object.
    var BaseFactory = function (ObjConstructor, updateFn) {
        // map of cached objects by id
        this.objMap = {};
        // array of cached objects
        this.objArr = [];
        this.updateFn = updateFn;
        this.ObjConstructor = ObjConstructor;
    };

    var DEFAULT_UPDATE_FREQUENCY = 3000;
    var updateFrequency = DEFAULT_UPDATE_FREQUENCY;

    var $q, $interval, $rootScope;

    angular.module("baseFactory", []).factory("baseFactory", ["$q", "$interval", "$rootScope", "servicedConfig", function (_$q, _$interval, _$rootScope, servicedConfig) {
        $q = _$q;
        $interval = _$interval;
        $rootScope = _$rootScope;

        servicedConfig.getConfig().then(function (config) {
            updateFrequency = config.PollFrequency * 1000;
        })["catch"](function (err) {
            var errMessage = err.statusText;
            if (err.data && err.data.Detail) {
                errMessage = err.data.Detail;
            }
            console.error("could not load serviced config:", errMessage);
        });

        return BaseFactory;
    }]);


    BaseFactory.prototype = {
        constructor: BaseFactory,

        // TODO - debounce
        // update calls the provided update function, iterates the results,
        // compares them to cached results and updates, creates, or deletes
        // objects based on id
        update: function () {
            var _this = this;
            var deferred = $q.defer();
            this.updateFn().success(function (data, status) {
                var included = [];

                for (var id in data) {
                    var obj = data[id];

                    // update
                    if (_this.objMap[id]) {
                        _this.objMap[id].update(obj);

                        // new
                    } else {
                        _this.objMap[id] = new _this.ObjConstructor(obj);
                        _this.objArr.push(_this.objMap[id]);
                    }

                    included.push(id);
                }

                // delete
                if (included.length !== Object.keys(_this.objMap).length) {
                    // iterate objMap and find keys
                    // not present in included list
                    for (var id in _this.objMap) {
                        if (included.indexOf(id) === -1) {
                            _this.objArr.splice(_this.objArr.indexOf(_this.objMap[id]), 1);
                            delete _this.objMap[id];
                        }
                    }
                }

                deferred.resolve();
            }).error(function (data, status) {
                console.warn("Unable to update factory", data);
            })["finally"](function () {
                // notify the first request is complete
                if (!_this.lastUpdate) {
                    $rootScope.$emit("ready");
                }

                _this.lastUpdate = new Date().getTime();
            });
            return deferred.promise;
        },

        // begins auto-update
        activate: function () {
            var _this2 = this;
            if (!this.updatePromise) {
                this.updatePromise = $interval(function () {
                    return _this2.update();
                }, updateFrequency);
            }
        },

        // stops auto-update
        deactivate: function () {
            if (this.updatePromise) {
                $interval.cancel(this.updatePromise);
                this.updatePromise = null;
            }
        },

        // returns an object by id
        get: function (id) {
            return this.objMap[id];
        }
    };


    /*
 * example of a type that could be passed
 * in as ObjectConstructor

        function Obj(obj){
            this.update(obj);

            // do more init stuff here
        }

        Obj.prototype = {
            constructor: Obj,
            update: function(obj){
                // if obj is provided, update
                // immutable internal representation
                // of that object
                if(obj){
                    this.updateObjDef(obj);
                }

                // do more update stuff here
            },

            // update immutable copy of the object
            // from the backend
            updateObjDef: function(obj){
                // alias some properties for easy access
                this.name = obj.Name;
                this.id = obj.ID;
                this.model = Object.freeze(obj);

                // do more update stuff here
            },
        };
*/
})();
"use strict";

/* globals jstz: true */
/* tableDirective.js
 * Wrapper for ngTable that gives a bit more
 * control and customization
 */

/*
 *TODO
 *generate unique id thing for ng-table property? (jellyTable1)
 *
 *
 */
(function () {
    "use strict";

    var count = 0;

    angular.module("jellyTable", []).directive("jellyTable", ["$interval", "ngTableParams", "$filter", "$animate", "$compile", "miscUtils", function ($interval, NgTableParams, $filter, $animate, $compile, utils) {
        return {
            restrict: "A",
            // inherit parent scope
            scope: true,
            // ensure this directive accesses the template
            // before ng-repeat and ng-table do
            priority: 1002,
            // do not continue parsing the template
            terminal: true,
            compile: function (table) {
                var $wrap, tableID, fn;

                // wrap the table up real nice
                $wrap = $("<div class=\"jelly-table\"></div>");
                table.after($wrap);
                $wrap.append(table);

                // unique property name for this table
                tableID = "jellyTable" + count++;

                // add loading and no data elements
                table.find("tr").last().after("<tr class=\"noData\"><td colspan=\"100%\" translate>no_data</td></tr>").after("<tr class=\"loader\"><td colspan=\"100%\">&nbsp;</td></tr>");

                // add table status bar
                table.append("\n                    <tfoot><tr>\n                        <td colspan=\"100%\" class=\"statusBar\">\n                            <ul>\n                                <li class=\"entry\">Last Update: <strong>{{" + tableID + ".lastUpdate | fromNow}}</strong></li>\n                                <li class=\"entry\">Showing <strong>{{" + tableID + ".resultsLength}}</strong>\n                                    Result{{ " + tableID + ".resultsLength !== 1 ? \"s\" : \"\"  }}\n                                </li>\n                            </ul>\n                        </td>\n                    </tr></tfoot>\n                ");


                // mark this guy as an ng-table
                table.attr("ng-table", tableID);

                // avoid compile loop
                table.removeAttr("jelly-table");

                // enable linker to compile and bind scope
                fn = $compile(table);

                // return link function
                return function ($scope, element, attrs) {
                    // bind scope to html
                    fn($scope);

                    var $loader, $noData, toggleLoader, toggleNoData, getData, pageConfig, dataConfig, timezone, orderBy;

                    var config = utils.propGetter($scope, attrs.config);
                    var data = utils.propGetter($scope, attrs.data);

                    orderBy = $filter("orderBy");

                    // setup some config defaults
                    // TODO - create a defaults object and merge
                    // TODO - create a "defaultSort" property and use
                    // it to compose the `sorting` config option
                    config().counts = config().counts || [];
                    config().watchExpression = config().watchExpression || function () {
                        return data();
                    };

                    timezone = jstz.determine().name();

                    // TODO - errors for missing data

                    $loader = $wrap.find(".loader");
                    $noData = $wrap.find(".noData");

                    toggleLoader = function (newVal, oldVal) {
                        if (oldVal === newVal) {
                            return;
                        }

                        // show loading spinner
                        if (newVal) {
                            $loader.show();
                            $animate.removeClass($loader, "disappear");

                            // hide loading spinner
                        } else {
                            $animate.addClass($loader, "disappear").then(function () {
                                $loader.hide();
                            });
                        }
                    };
                    toggleNoData = function (val) {
                        if (val) {
                            $noData.show();
                        } else {
                            $noData.hide();
                        }
                    };

                    getData = function ($defer, params) {
                        var unorderedData = data(),
                            orderedData;

                        // if unorderedData is an object, convert to array
                        // NOTE: angular.isObject does not consider null to be an object
                        if (!angular.isArray(unorderedData) && angular.isObject(unorderedData)) {
                            unorderedData = utils.mapToArr(unorderedData);

                            // if it's null, create empty array
                        } else if (unorderedData === null) {
                            unorderedData = [];
                        }

                        // call overriden getData
                        if (config().getData) {
                            orderedData = config().getData(unorderedData, params);

                            // use default getData
                        } else {
                            orderedData = params.sorting() ? orderBy(unorderedData, params.orderBy()) : unorderedData;
                        }

                        // if no data, show loading and default
                        // to empty array
                        if (angular.isUndefined(orderedData)) {
                            $scope[tableID].loading = true;
                            toggleNoData(false);
                            orderedData = [];

                            // if data, hide loading, and check if empty
                            // array
                        } else {
                            $scope[tableID].loading = false;
                            // if the request succeded but is
                            // just empty, show no data message
                            if (!orderedData.length) {
                                toggleNoData(true);

                                // otherwise, hide no data message
                            } else {
                                toggleNoData(false);
                            }
                        }

                        $scope[tableID].resultsLength = orderedData.length;
                        $scope[tableID].lastUpdate = moment.utc().tz(timezone);

                        $defer.resolve(orderedData);
                    };

                    // setup config for ngtable
                    pageConfig = {
                        sorting: config().sorting
                    };
                    dataConfig = {
                        counts: config().counts,
                        getData: getData
                    };

                    // configure ngtable
                    $scope[tableID] = new NgTableParams(pageConfig, dataConfig);
                    $scope[tableID].loading = true;
                    toggleNoData(false);

                    // watch data for changes
                    $scope.$watch(config().watchExpression, function () {
                        $scope[tableID].reload();
                    });

                    $scope.$watch(tableID + ".loading", toggleLoader);
                };
            }
        };
    }]);
})();
"use strict";

/* miscDirectives.js
 * a place for miscellaneous directives
 */
(function () {
    "use strict";

    controlplane
    /**
     * This is a fix for https://jira.zenoss.com/browse/ZEN-10263
     * It makes sure that inputs that are filled in by autofill (like when the browser remembers the password)
     * are updated in the $scope. See the partials/login.html for an example
     **/.directive("formAutofillFix", [function () {
        return function (scope, elem, attrs) {
            // Fixes Chrome bug: https://groups.google.com/forum/#!topic/angular/6NlucSskQjY
            elem.prop("method", "POST");

            // Fix autofill issues where Angular doesn't know about autofilled inputs
            if (attrs.ngSubmit) {
                window.setTimeout(function () {
                    elem.unbind("submit").submit(function (e) {
                        e.preventDefault();
                        elem.find("input, textarea, select").trigger("input").trigger("change").trigger("keydown");
                        scope.$apply(attrs.ngSubmit);
                    });
                }, 0);
            }
        };
    }]).directive("popover", [function () {
        return function (scope, elem, attrs) {
            $(elem).popover({
                title: attrs.popoverTitle,
                trigger: "hover",
                html: true,
                content: attrs.popover
            });
        };
    }]).directive("scroll", ["$rootScope", "$window", "$timeout", function ($rootScope, $window, $timeout) {
        return {
            link: function (scope, elem, attr) {
                $window = angular.element($window);
                var handler = function () {
                    var winEdge, elEdge, dataHidden;
                    winEdge = $window.height() + $window.scrollTop();
                    elEdge = elem.offset().top + elem.height();
                    dataHidden = elEdge - winEdge;
                    if (dataHidden < parseInt(attr.scrollSize, 10)) {
                        if ($rootScope.$$phase) {
                            if (scope.$eval(attr.scroll)) {
                                $timeout(handler, 100);
                            }
                        } else {
                            if (scope.$apply(attr.scroll)) {
                                $timeout(handler, 100);
                            }
                        }
                    }
                };
                if (attr.scrollHandlerObj && attr.scrollHandlerField) {
                    var obj = scope[attr.scrollHandlerObj];
                    obj[attr.scrollHandlerField] = handler;
                }
                $window.on("scroll", handler);
                $window.on("resize", handler);
                scope.$on("$destroy", function () {
                    $window.off("scroll", handler);
                    $window.off("resize", handler);
                    return true;
                });
                return $timeout(function () {
                    return handler();
                }, 100);
            }
        };
    }]);
})();
"use strict";

/* miscUtils.js
 * miscellaneous utils and stuff that
 * doesn't quite fit in elsewhere
 */
(function () {
    "use strict";

    angular.module("miscUtils", []).factory("miscUtils", ["$parse", function ($parse) {
        //polyfill endsWith so phantomjs won't complain :/
        if (!String.prototype.endsWith) {
            String.prototype.endsWith = function (searchString, position) {
                var subjectString = this.toString();
                if (typeof position !== "number" || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
                    position = subjectString.length;
                }
                position -= searchString.length;
                var lastIndex = subjectString.indexOf(searchString, position);
                return lastIndex !== -1 && lastIndex === position;
            };
        }

        var utils = {

            // TODO - use angular $location object to make this testable
            unauthorized: function () {
                console.error("You don't appear to be logged in.");
                // show the login page and then refresh so we lose any incorrect state. CC-279
                window.location.href = "/#/login";
                window.location.reload();
            },

            indentClass: function (depth) {
                return "indent" + (depth - 1);
            },

            downloadFile: function (url) {
                window.location = url;
            },

            getModeFromFilename: function (filename) {
                var re = /(?:\.([^.]+))?$/;
                var ext = re.exec(filename)[1];
                var mode;
                switch (ext) {
                    case "conf":
                        mode = "properties";
                        break;
                    case "xml":
                        mode = "xml";
                        break;
                    case "yaml":
                        mode = "yaml";
                        break;
                    case "txt":
                        mode = "plain";
                        break;
                    case "json":
                        mode = "javascript";
                        break;
                    default:
                        mode = "shell";
                        break;
                }

                return mode;
            },

            updateLanguage: function ($scope, $cookies, $translate) {
                var ln = "en_US";
                if ($cookies.Language === undefined) {} else {
                    ln = $cookies.Language;
                }
                if ($scope.user) {
                    $scope.user.language = ln;
                }
                $translate.use(ln);
            },

            capitalizeFirst: function (str) {
                return str.slice(0, 1).toUpperCase() + str.slice(1);
            },

            // call fn b after fn a
            after: function (a, b, context) {
                return function () {
                    var results;
                    results = a.apply(context, arguments);
                    // TODO - send results to b?
                    b.call(context);
                    return results;
                };
            },

            mapToArr: function (data) {
                var arr = [];
                for (var key in data) {
                    arr.push(data[key]);
                }
                return arr;
            },


            // cache function results based on hash function.
            // NOTE: unlike regular memoize, the caching is entirely
            // based on hash function, not on arguments
            memoize: function (fn, hash) {
                var cache = {};
                return function () {
                    var key = hash.apply(this, arguments),
                        val;

                    // if value isnt cached, evaluate and cache
                    if (!(key in cache)) {
                        val = fn.apply(this, arguments);
                        cache[key] = val;
                    } else {
                        val = cache[key];
                    }

                    return val;
                };
            },

            needsHostAlias: function (host) {
                // check is location.hostname is an IP
                var re = /\b(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/;
                return re.test(host) || host === "localhost";
            },

            parseEngineeringNotation: function (str) {
                // Converts nK/k, nM/m, nG/g, nT/t to a number. e.g. 1K returns 1024.
                if (str === "" || str === undefined) {
                    return 0;
                }

                // if this is already a regular, boring, ol number
                if (isFinite(+str)) {
                    return +str;
                }

                var prefix = parseFloat(str);
                var suffix = str.slice(prefix.toString().length);
                switch (suffix) {
                    case "K":
                    case "k":
                        prefix *= 1 << 10;
                        break;
                    case "M":
                    case "m":
                        prefix *= 1 << 20;
                        break;
                    case "G":
                    case "g":
                        prefix *= 1 << 30;
                        break;
                    case "T":
                    case "t":
                        prefix *= 1 << 40;
                        break;
                    default:
                        prefix = undefined;
                        break;
                }
                return prefix;
            },

            // returns a function that will parse the
            // expression `attr` on scope object $scope
            // and return that value
            propGetter: function ($scope, attr) {
                var getter = $parse(attr);
                return function () {
                    return getter($scope);
                };
            },

            // TODO - make services that should not count configurable
            // eg: started, stopped, manual, etc
            countTheKids: function (parentService) {
                var filterFunction = arguments[1] === undefined ? function () {
                    return true;
                } : arguments[1];
                var children = parentService.children || [],
                    childCount = 0;

                // count number of descendent services that will start
                childCount = children.reduce(function countTheKids(acc, service) {
                    // if a service is not set to manual launch and
                    // has a startup command, it probably should count
                    var shouldCount = service.model.Launch !== "manual" && service.model.Startup;

                    // if shouldCount and the filter function returns
                    // true, this definitely counts
                    if (shouldCount && filterFunction(service)) {
                        acc++;
                    }

                    // if the service has children, check em
                    if (service.children) {
                        return service.children.reduce(countTheKids, acc);
                    }
                }, 0);

                return childCount;
            },

            validateHostName: function (hostStr, $translate) {
                if (hostStr === undefined || hostStr === "") {
                    return $translate.instant("content_wizard_invalid_host");
                }

                return null;
            },

            validatePortNumber: function (port, $translate) {
                if (port === undefined || port === "") {
                    return $translate.instant("port_number_invalid");
                }
                if (+port < 1 || +port > 65535) {
                    return $translate.instant("port_number_invalid_range");
                }

                return null;
            },

            validateRAMLimit: function (limitStr) {
                var max = arguments[1] === undefined ? Infinity : arguments[1];


                if (limitStr === undefined || limitStr === "") {
                    return null;
                }

                var isPercent = limitStr.endsWith("%");
                var isEngineeringNotation = /.*[KkMmGgTt]$/.test(limitStr);

                if (!isPercent && !isEngineeringNotation) {
                    return "Invalid RAM Limit value, must specify % or unit of K, M, G, or T";
                }

                // if this is a percent, ensure its between 1 and 100
                if (isPercent) {
                    var val = +limitStr.slice(0, -1);
                    if (val > 100) {
                        return "RAM Limit cannot exceed 100%";
                    }
                    if (val <= 0) {
                        return "RAM Limit must be at least 1%";
                    }

                    // if this is a byte value, ensure its less than host memory
                } else {
                    var val = utils.parseEngineeringNotation(limitStr);
                    if (isNaN(val) || val === undefined) {
                        return "Invalid RAM Limit value";
                    }
                    if (val > max) {
                        return "RAM Limit exceeds available host memory";
                    }
                    if (val <= 0) {
                        return "RAM Limit must be at least 1";
                    }
                }
                return null;
            }
        };

        return utils;
    }]);
})();
"use strict";

/* jshint multistr: true */
(function () {
    "use strict";

    angular.module("modalService", []).factory("$modalService", ["$rootScope", "$templateCache", "$http", "$interpolate", "$compile", "$translate", "$notification", function ($rootScope, $templateCache, $http, $interpolate, $compile, $translate, $notification) {
        /**
             * Modal window
             */
        var Modal = function (template, model, config) {
            var $modalFooter;

            // inject user provided template into modal template
            var modalTemplate = $interpolate(defaultModalTemplate)({
                template: template,
                title: $translate.instant(config.title),
                bigModal: config.bigModal ? "big" : ""
            });

            // bind user provided model to final modal template
            this.$el = $($compile(modalTemplate)(model)).modal();

            $modalFooter = this.$el.find(".modal-footer");
            // cache a reference to the notification holder
            this.$notificationEl = this.$el.find(".modal-notify");

            // create action buttons
            config.actions.forEach((function (action) {
                // if this action has a role on it, merge role defaults
                if (action.role && defaultRoles[action.role]) {
                    for (var i in defaultRoles[action.role]) {
                        action[i] = action[i] || defaultRoles[action.role][i];
                    }
                }

                // translate button label
                action.label = $translate.instant(action.label);

                var $button = $($interpolate(actionButtonTemplate)(action));
                $button.on("click", action.action.bind(this));
                $modalFooter.append($button);
            }).bind(this));

            // if no actions, remove footer
            if (!config.actions.length) {
                $modalFooter.remove();
            }

            // setup/default validation function
            this.validateFn = config.validate || function (args) {
                return true;
            };

            // listen for hide event and completely remove modal
            // after it is hidden
            this.$el.on("hidden.bs.modal", (function () {
                this.destroy();
            }).bind(this));
        };

        /**
             * Fetches modal template and caches it in $templateCache.
             * returns a promise for the http request
             */
        var fetchModalTemplate = function (name) {
            var url = modalsPath + name;
            return $http.get(url, { cache: $templateCache });
        };

        /**
             * fetches modal template and passes it along to be attached
             * to the DOM
             */
        var create = function (config) {
            config = config || {};
            // TODO - default config object
            config.actions = config.actions || [];
            config.onShow = config.onShow || function () {};
            config.onHide = config.onHide || function () {};
            var model = config.model || {};

            // if the template was provided, use that
            if (config.template) {
                _create(config.template, model, config);

                // otherwise, request the template
                // TODO - pop a modal with load spinner?
            } else {
                fetchModalTemplate(config.templateUrl).then(function (res) {
                    _create(res.data, model, config);
                });
            }
        };

        var _create = function (template, model, config) {
            // immediately destroy any existing modals
            modals.forEach(function (momo) {
                momo.destroy();
            });

            var modal = new Modal(template, model, config);
            modal.show();

            modals = [modal];

            // perform onShow function after modal is visible
            modal.$el.one("shown.bs.modal.", function () {
                // search for and autofocus the focusme element
                modal.$el.find("[focusme]").first().focus();

                // call user provided onShow function
                config.onShow.call(modal);
            });

            modal.$el.one("hidden.bs.modal.", config.onHide.bind(modal));
        };

        var defaultModalTemplate = "<div class=\"modal fade\" tabindex=\"-1\" role=\"dialog\" aria-hidden=\"true\">                <div class=\"modal-dialog {{bigModal}}\">                    <div class=\"modal-content\">                        <div class=\"modal-header\">                            <button type=\"button\" class=\"close glyphicon glyphicon-remove-circle\" data-dismiss=\"modal\" aria-hidden=\"true\"></button>                            <span class=\"modal-title\">{{title}}</span>                        </div>                        <div class=\"modal-notify\"></div>                        <div class=\"modal-body\">{{template}}</div>                        <div class=\"modal-footer\"></div>                    </div>                </div>            </div>";

        var actionButtonTemplate = "<button type=\"button\" class=\"btn {{classes}}\"><span ng-show=\"icon\" class=\"glyphicon {{icon}}\"></span> {{label}}</button>";

        var defaultRoles = {
            cancel: {
                label: "Cancel",
                icon: "glyphicon-remove",
                classes: "btn-link minor",
                action: function () {
                    this.close();
                }
            },
            ok: {
                label: "Ok",
                icon: "glyphicon-ok",
                classes: "btn-primary submit",
                action: function () {
                    this.close();
                }
            }
        };

        Modal.prototype = {
            constructor: Modal,
            close: function () {
                this.$el.modal("hide");
            },
            show: function () {
                this.$el.modal("show");
                this.disableScroll();
            },
            validate: function (args) {
                return this.validateFn(args);
            },
            destroy: function () {
                this.$el.remove();
                this.enableScroll();
            },
            // convenience method for attaching notifications to the modal
            createNotification: function (title, message) {
                return $notification.create(title, message, this.$notificationEl);
            },

            disableScroll: function disableScroll() {
                var bodyEl = $("body");
                this.bodyOverflowProp = bodyEl.css("overflow");
                bodyEl.css("overflow", "hidden");
            },
            enableScroll: function enableScroll() {
                var prop = this.bodyOverflowProp || "scroll";
                $("body").css("overflow", prop);
            },

            // convenience method to disable the default ok/submit button
            disableSubmitButton: function (selector, disabledText) {
                selector = selector || ".submit";
                disabledText = disabledText || "Submitting...";

                var $button = this.$el.find(selector),
                    $buttonClone,
                    buttonContent,
                    startWidth,
                    endWidth;

                // button wasnt found
                if (!$button.length) {
                    return;
                }

                // explicitly set width so it can be animated
                startWidth = $button.width();

                // clone the button and set the ending text so the
                // explicit width can be calculated
                $buttonClone = $button.clone().width("auto").text(disabledText).appendTo("body");
                endWidth = $buttonClone.width();
                $buttonClone.remove();

                $button.width(startWidth);

                buttonContent = $button.html();
                $button.prop("disabled", true).addClass("disabled").text(disabledText).width(endWidth);

                // return a function used to reenable the button
                return function () {
                    $button.prop("disabled", false).removeClass("disabled").html(buttonContent).width(startWidth);
                };
            }
        };




        var modalsPath = "/static/partials/",

        // keep track of existing modals so that they can be
        // close/destroyed when a new one is created
        // TODO - remove modals from this list when they are hidden
        modals = [];

        return {
            create: create
        };
    }]);
})();
"use strict";

/* globals controlplane: true */
(function () {
    var REQUEST_TIMEOUT = 30000;
    var GET = "get";
    var PUT = "put";
    var DELETE = "delete";
    var POST = "post";

    controlplane.factory("resourcesFactory", ["$http", "$location", "$notification", "DSCacheFactory", "$q", "$interval", "miscUtils", function ($http, $location, $notification, DSCacheFactory, $q, $interval, utils) {
        // adds success and error functions
        // to regular promise ala $http
        var httpify = function (deferred) {
            deferred.promise.success = function (fn) {
                deferred.promise.then(fn);
                return deferred.promise;
            };
            deferred.promise.error = function (fn) {
                deferred.promise.then(null, fn);
                return deferred.promise;
            };
            return deferred;
        };

        var generateMethod = function (config) {
            // method should be all lowercase
            config.method = config.method.toLowerCase();

            // if url is a string, turn it into a getter fn
            if (typeof config.url === "string") {
                (function () {
                    var url = config.url;
                    config.url = function () {
                        return url;
                    };
                })();
            }

            return function () {
                var url = config.url.apply(null, arguments),
                    method = config.method,
                    resourceName = url,
                    payload,

                // deferred that will be returned to the user
                deferred = $q.defer(),
                    requestObj;

                // if resourceName has query params, strip em off
                if (resourceName.indexOf("?")) {
                    resourceName = resourceName.split("?")[0];
                }

                // NOTE: all of our code expects angular's wrapped
                // promises which provide a success and error method
                // TODO - remove the need for this
                httpify(deferred);

                // theres already a pending request to
                // this endpoint, so fail!
                if (method === GET && pendingGETRequests[resourceName]) {
                    deferred.reject("a request to " + resourceName + " is pending");
                    return deferred.promise;
                }

                if (config.payload) {
                    payload = config.payload.apply(null, arguments);
                }

                requestObj = {
                    method: method,
                    url: url,
                    data: payload
                };

                if (method === GET) {
                    requestObj.timeout = REQUEST_TIMEOUT;
                }

                $http(requestObj).success(function (data, status) {
                    deferred.resolve(data);
                }).error(function (data, status) {
                    // TODO - include status as well?
                    deferred.reject(data);
                    redirectIfUnauthorized(status);
                })["finally"](function () {
                    if (method === GET) {
                        pendingGETRequests[resourceName] = null;
                    }
                });

                // NOTE: only limits GET requests
                if (method === GET) {
                    pendingGETRequests[resourceName] = deferred;
                }

                return deferred.promise;
            };
        };

        // add function to $http service to allow for noCacheGet requests
        $http.noCacheGet = function (location) {
            return $http({ url: location, method: "GET", params: { time: new Date().getTime() } });
        };

        var pollingFunctions = {};

        var redirectIfUnauthorized = function (status) {
            if (status === 401) {
                utils.unauthorized($location);
            }
        };

        /*
         * a methodConfig is used to create a resources
         * factory interface method. The methodConfig object
         * has the following properties:
         *
         * @prop {string} method        - GET, POST, PUT, DELETE
         * @prop {string|function} url  - a string representing the url, or a function
         *                                that can generate the url. the function will
         *                                receive arguments passed to the factory method
         * @prop {function} [payload]   - function that returns the payload to be
         *                                delivered for POST or PUT request. the function
         *                                will receive arguments passed to the factory
         *                                method
         */
        var methodConfigs = {
            assignIP: {
                method: PUT,
                url: function (id, ip) {
                    var url = "/services/" + id + "/ip";
                    if (ip) {
                        url += "/" + ip;
                    }
                    return url;
                }
            },
            getPools: {
                method: GET,
                url: "/pools"
            },
            getPoolIPs: {
                method: GET,
                url: function (id) {
                    return "/pools/" + id + "/ips";
                }
            },
            addVHost: {
                method: PUT,
                url: function (serviceID, endpointName, vhostName) {
                    return "/services/" + serviceID + "/endpoint/" + endpointName + "/vhosts/" + vhostName;
                },
                payload: function (serviceID, endpointName, vhostName) {
                    return JSON.stringify({
                        ServiceID: serviceID,
                        Application: endpointName,
                        VirtualHostName: vhostName
                    });
                }
            },
            removeVHost: {
                method: DELETE,
                url: function (serviceID, endpointName, vhostName) {
                    return "/services/" + serviceID + "/endpoint/" + endpointName + "/vhosts/" + vhostName;
                }
            },
            enableVHost: {
                method: POST,
                url: function (serviceID, endpointName, vhostName) {
                    return "/services/" + serviceID + "/endpoint/" + endpointName + "/vhosts/" + vhostName;
                },
                payload: function () {
                    return JSON.stringify({ Enable: true });
                }
            },
            disableVHost: {
                method: POST,
                url: function (serviceID, endpointName, vhostName) {
                    return "/services/" + serviceID + "/endpoint/" + endpointName + "/vhosts/" + vhostName;
                },
                payload: function () {
                    return JSON.stringify({ Enable: false });
                }
            },
            addPort: {
                method: PUT,
                url: function (serviceID, endpointName, portName, portIP) {
                    return "/services/" + serviceID + "/endpoint/" + endpointName + "/ports/" + portName;
                },
                payload: function (serviceID, endpointName, portName, portIP) {
                    return JSON.stringify({
                        ServiceID: serviceID,
                        Application: endpointName,
                        PortName: portName
                    });
                }
            },
            removePort: {
                method: DELETE,
                url: function (serviceID, endpointName, portName) {
                    return "/services/" + serviceID + "/endpoint/" + endpointName + "/ports/" + portName;
                }
            },
            enablePort: {
                method: POST,
                url: function (serviceID, endpointName, portName) {
                    return "/services/" + serviceID + "/endpoint/" + endpointName + "/ports/" + portName;
                },
                payload: function (serviceID, endpointName, portName, portIP) {
                    return JSON.stringify({
                        Enable: true
                    });
                }
            },
            disablePort: {
                method: POST,
                url: function (serviceID, endpointName, portName) {
                    return "/services/" + serviceID + "/endpoint/" + endpointName + "/ports/" + portName;
                },
                payload: function () {
                    return JSON.stringify({ Enable: false });
                }
            },
            getServiceInstances: {
                method: GET,
                url: "/servicestatus"
            },
            addPool: {
                method: POST,
                url: "/pools/add",
                payload: function (pool) {
                    return pool;
                }
            },
            removePool: {
                method: DELETE,
                url: function (id) {
                    return "/pools/" + id;
                }
            },
            addPoolVirtualIP: {
                method: PUT,
                url: function (poolID) {
                    return "/pools/" + poolID + "/virtualip";
                },
                payload: function (poolID, ip, netmask, bindInterface) {
                    return JSON.stringify({
                        PoolID: poolID,
                        IP: ip,
                        Netmask: netmask,
                        BindInterface: bindInterface
                    });
                }
            },
            removePoolVirtualIP: {
                method: DELETE,
                url: function (poolID, ip) {
                    return "/pools/" + poolID + "/virtualip/" + ip;
                } },
            killRunning: {
                method: DELETE,
                url: function (hostID, instanceID) {
                    return "/hosts/" + hostID + "/" + instanceID;
                }
            },
            getHosts: {
                method: GET,
                url: "/hosts"
            },
            addHost: {
                method: POST,
                url: "/hosts/add",
                payload: function (host) {
                    return host;
                }
            },
            updateHost: {
                method: PUT,
                url: function (id) {
                    return "/hosts/" + id;
                },
                payload: function (id, host) {
                    return host;
                }
            },
            removeHost: {
                method: DELETE,
                url: function (id) {
                    return "/hosts/" + id;
                }
            },
            getRunningHosts: {
                method: GET,
                url: "/hosts/running"
            },
            getServices: {
                method: GET,
                url: function (since) {
                    return "/services" + (since ? "?since=" + since : "");
                } },
            getInstanceLogs: {
                method: GET,
                url: function (serviceID, instanceID) {
                    return "/services/" + serviceID + "/" + instanceID + "/logs";
                }
            },
            dockerIsLoggedIn: {
                method: GET,
                url: "/dockerIsLoggedIn"
            },
            getAppTemplates: {
                method: GET,
                url: "/templates"
            },
            removeAppTemplate: {
                method: DELETE,
                url: function (id) {
                    return "/templates/" + id;
                }
            },
            updateService: {
                method: PUT,
                url: function (id) {
                    return "/services/" + id;
                },
                payload: function (id, service) {
                    return service;
                }
            },
            deployAppTemplate: {
                method: POST,
                url: "/templates/deploy",
                payload: function (template) {
                    return template;
                }
            },
            removeService: {
                method: DELETE,
                url: function (id) {
                    return "/services/" + id;
                }
            },
            startService: {
                method: PUT,
                url: function (id, skip) {
                    return "/services/" + id + "/startService" + (skip ? "?auto=false" : "");
                }
            },
            stopService: {
                method: PUT,
                url: function (id, skip) {
                    return "/services/" + id + "/stopService" + (skip ? "?auto=false" : "");
                }
            },
            restartService: {
                method: PUT,
                url: function (id, skip) {
                    return "/services/" + id + "/restartService" + (skip ? "?auto=false" : "");
                }
            },
            getVersion: {
                method: GET,
                url: "/version"
            },
            getDeployStatus: {
                method: POST,
                url: "/templates/deploy/status",
                payload: function (def) {
                    return def;
                }
            },
            getDeployingTemplates: {
                method: GET,
                url: "/templates/deploy/active"
            },
            createBackup: {
                method: GET,
                url: "/backup/create"
            },
            restoreBackup: {
                method: GET,
                url: function (filename) {
                    return "/backup/restore?filename=" + filename;
                }
            },
            getBackupFiles: {
                method: GET,
                url: "/backup/list"
            },
            getBackupStatus: {
                method: GET,
                url: "/backup/status"
            },
            getRestoreStatus: {
                method: GET,
                url: "/backup/restore/status"
            },
            getHostAlias: {
                method: GET,
                url: "/hosts/defaultHostAlias"
            },
            getUIConfig: {
                method: GET,
                url: "/config"
            }
        };

        var pendingGETRequests = {};

        var resourcesFactoryInterface = {
            addAppTemplate: function (fileData) {
                return $http({
                    url: "/templates/add",
                    method: POST,
                    data: fileData,
                    // content-type undefined forces the browser to fill in the
                    // boundary parameter of the request
                    headers: { "Content-Type": undefined },
                    // identity returns the value it receives, which prevents
                    // transform from modifying the request in any way
                    transformRequest: angular.identity }).error(function (data, status) {
                    redirectIfUnauthorized(status);
                });
            },

            registerPoll: function (label, callback, interval) {
                if (pollingFunctions[label] !== undefined) {
                    clearInterval(pollingFunctions[label]);
                }

                pollingFunctions[label] = $interval(function () {
                    callback();
                }, interval);
            },

            unregisterAllPolls: function () {
                for (var key in pollingFunctions) {
                    $interval.cancel(pollingFunctions[key]);
                }

                pollingFunctions = {};
            },

            // redirect to specific service details
            routeToService: function (id) {
                $location.path("/services/" + id);
            },

            // redirect to specific pool
            routeToPool: function (id) {
                $location.path("/pools/" + id);
            },

            // redirect to specific host
            routeToHost: function (id) {
                $location.path("/hosts/" + id);
            }
        };

        // generate additional methods and attach
        // to interface
        for (var name in methodConfigs) {
            resourcesFactoryInterface[name] = generateMethod(methodConfigs[name]);
        }

        return resourcesFactoryInterface;
    }]);
})();
/* args */
"use strict";

var _prototypeProperties = function (child, staticProps, instanceProps) {
    if (staticProps) Object.defineProperties(child, staticProps);
    if (instanceProps) Object.defineProperties(child.prototype, instanceProps);
};

/* servicedConfigService.js
 * get UI config values from serviced
 */
(function () {
    "use strict";

    var resourcesFactory, $q;

    var ServicedConfig = (function () {
        function ServicedConfig() {}

        _prototypeProperties(ServicedConfig, null, {
            update: {
                value: function update() {
                    var d = $q.defer();

                    resourcesFactory.getUIConfig()
                    // TODO - errors
                    .then(function (response) {
                        d.resolve(response);
                    }, function (err) {
                        d.reject(err);
                    });

                    this._d = d.promise;
                    return this._d;
                },
                writable: true,
                enumerable: true,
                configurable: true
            },
            getConfig: {
                value: function getConfig() {
                    if (!this._d) {
                        this.update();
                    }
                    return this._d;
                },
                writable: true,
                enumerable: true,
                configurable: true
            }
        });

        return ServicedConfig;
    })();

    var servicedConfig = new ServicedConfig();

    angular.module("servicedConfig", []).factory("servicedConfig", ["$q", "resourcesFactory", function (_$q, _resourcesFactory) {
        resourcesFactory = _resourcesFactory;
        $q = _$q;
        servicedConfig.update();
        return servicedConfig;
    }]);
})();
"use strict";

/* global: $ */
/* jshint multistr: true */
(function () {
    "use strict";

    angular.module("ui.datetimepicker", []).directive("datetimepicker", [function () {
        return {
            restrict: "A",
            require: "ngModel",
            link: function (scope, element, attrs, ngModelCtrl) {
                // wait a tick before init because calling directive
                // may not have completed its init yet
                setTimeout(function () {
                    var options = {};
                    if (attrs.dateoptions && scope[attrs.dateoptions]) {
                        options = scope[attrs.dateoptions];
                    }
                    element.datetimepicker(options);
                    element.bind("blur keyup change", function () {
                        var model = attrs.ngModel;
                        if (model.indexOf(".") > -1) {
                            scope[model.replace(/\.[^.]*/, "")][model.replace(/[^.]*\./, "")] = element.val();
                        } else {
                            scope[model] = element.val();
                        }
                    });
                }, 0);
            }
        };
    }]);

})();
"use strict";

/* global: $ */
/* jshint multistr: true */
var SEVERITY = {
    SUCCESS: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3
};

// stores whatever the last message is
var lastMessage;

(function () {
    "use strict";

    /**
     * @ngdoc overview
     * @name notification
     */

    angular.module("zenNotify", []).

    /**
     * @ngdoc object
     * @name zenNotify.Notification
     * @requires $templateCache
     */

    factory("$notification", ["$rootScope", "$templateCache", "$translate", function ($rootScope, $templateCache, $translate) {
        /**
         * Notification
         * Creates a notification. Great for parties!
         */
        var Notification = function (id, title, msg, $attachPoint) {
            this.id = id;
            this.$el = $(notificationTemplate);
            this.$message = this.$el.find(".message");
            this.$title = this.$el.find(".title");
            this.title = title;
            this.msg = msg;
            this.$attachPoint = $attachPoint;
            this.severity = SEVERITY.INFO;

            this.updateTitle(this.title || "");
            this.updateStatus(this.msg || "");

            // bind onClose context so it doesn't have
            // to be rebound for each event listener
            this.onClose = this.onClose.bind(this);
            this.hide = this.hide.bind(this);
        };

        var NotificationFactory = function () {
            this.$storage = JSON.parse(localStorage.getItem("messages")) || [];
            this.lastId = null;

            // if this is the first time we sending a message, try to lookup the next ID from storage
            if (this.lastId === null) {
                this.lastId = 0;
                this.$storage.forEach((function (el, idx) {
                    if (el.id >= this.lastId) {
                        this.lastId = el.id;
                    }
                }).bind(this));
            }
        };

        var notificationFactory;

        var notificationTemplate = "<div class=\"bg-info notification\" style=\"display:none;\">            <span class=\"dialogIcon glyphicon glyphicon-info-sign\"></span>            <span class=\"title\"></span>            <span class=\"message\"></span>            <button type=\"button\" class=\"close\" aria-hidden=\"true\" style=\"display:none;\">&times;</button>        </div>";

        Notification.prototype = {
            constructor: Notification,

            success: function (autoclose) {
                this.severity = SEVERITY.SUCCESS;

                // change notification color, icon, text, etc
                this.$el.removeClass("bg-info").addClass("bg-success");
                this.$el.find(".dialogIcon").removeClass("glyphicon-info-sign").addClass("glyphicon-ok-sign");

                this.updateTitle(this.title || $translate.instant("success"));
                this.updateStatus(this.msg || "");

                // show close button and make it active
                this.$el.find(".close").show().off().on("click", this.onClose);
                notificationFactory.store(this);
                this.show(autoclose);

                return this;
            },

            warning: function (autoclose) {
                this.severity = SEVERITY.WARNING;

                // change notification color, icon, text, etc
                this.$el.removeClass("bg-info").addClass("bg-warning");
                this.$el.find(".dialogIcon").removeClass("glyphicon-info-sign").addClass("glyphicon-warning-sign");

                this.updateTitle(this.title || $translate.instant("warning"));
                this.updateStatus(this.msg || "");
                notificationFactory.store(this);
                if (!autoclose) {
                    // show close button and make it active
                    this.$el.find(".close").show().off().on("click", this.onClose);
                    notificationFactory.store(this);
                }
                this.show(autoclose);

                return this;
            },

            info: function (autoclose) {
                this.severity = SEVERITY.INFO;

                this.updateTitle(this.title || $translate.instant("info"));
                this.updateStatus(this.msg || "");

                // show close button and make it active
                this.$el.find(".close").show().off().on("click", this.onClose);
                notificationFactory.store(this);
                this.show(autoclose);

                return this;
            },

            error: function () {
                this.severity = SEVERITY.ERROR;

                // change notification color, icon, text, etc
                this.$el.removeClass("bg-info").addClass("bg-danger");
                this.$el.find(".dialogIcon").removeClass("glyphicon-info-sign").addClass("glyphicon-remove-sign");

                this.updateTitle(this.title || $translate.instant("error"));
                this.updateStatus(this.msg || "");

                // show close button and make it active
                this.$el.find(".close").show().off().on("click", this.onClose);
                notificationFactory.store(this);
                this.show(false);

                return this;
            },

            onClose: function (e) {
                notificationFactory.markRead(this);
                this.hide();
            },

            hide: function () {
                this.$el.slideUp("fast", (function () {
                    this.$el.remove();
                }).bind(this));
            },

            // updates the status message (the smaller text)
            updateStatus: function (msg) {
                this.msg = msg || "";
                this.$message.html(this.msg);
                return this;
            },

            // updates the notification title (larger text)
            updateTitle: function (title) {
                this.title = title || "";
                this.$title.text(this.title);
                return this;
            },

            show: function (autoclose) {
                // close previous message if it is not
                // the current message
                if (lastMessage && lastMessage !== this) {
                    lastMessage.hide();
                }

                // if $attachPoint is no longer in the document
                // use the default attachPoint
                if (!$.contains(document, this.$attachPoint[0])) {
                    this.$attachPoint = $("#notifications");
                }
                this.$attachPoint.append(this.$el);

                autoclose = typeof autoclose !== "undefined" ? autoclose : true;
                this.$el.slideDown("fast");

                if (autoclose) {
                    setTimeout(this.hide, 5000);
                }

                lastMessage = this;

                return this;
            }
        };


        /**
         * Notification Factory
         * interface for creating, storing, and updating notifications
         */
        NotificationFactory.prototype = {
            constructor: NotificationFactory,

            /**
             * create a new notification. Loads of fun!
             * @param  {string} title  notification title. treated as plain text
             * @param  {string} msg  notification message. treated as HTML
             * @param  {jQueryObject} $attachPoint  jQuery DOM element to attach notification to
             *                                      defaults to `#notification` element
             * @return {Notification}  returns the Notification object
             */
            create: function (title, msg, $attachPoint) {
                // if no valid attachPoint is provided, default to #notifications
                if (!$attachPoint || !$attachPoint.length) {
                    $attachPoint = $("#notifications");
                }
                var notification = new Notification(++this.lastId, title, msg, $attachPoint);

                return notification;
            },

            /**
             * marks provided notification read and updates local data store
             * @param  {Notification} notification  the Notification object to mark read
             */
            markRead: function (notification) {
                this.$storage.forEach((function (el, idx) {
                    if (el.id === notification.id) {
                        el.read = el.count;
                    }
                }).bind(this));

                localStorage.setItem("messages", JSON.stringify(this.$storage));
                $rootScope.$broadcast("messageUpdate");
            },

            /**
             * stores provided notification
             * @param  {Notification} notification  the Notification object to store
             */
            store: function (notification) {
                var storable = { id: notification.id, read: 0, date: new Date(), title: notification.title, msg: notification.msg, count: 1 };
                var newMessage = false;

                var isDuplicate = (function () {
                    // de-dup messages
                    for (var i = 0; i < this.$storage.length; ++i) {
                        var message = this.$storage[i];
                        console.log(notification.msg + " === " + message.msg);
                        if (message && notification.msg === message.msg) {
                            ++message.count;
                            return true;
                        } else {
                            return false;
                        }
                    }
                }).bind(this);

                if (!isDuplicate() && (notification.severity === SEVERITY.ERROR || notification.severity === SEVERITY.SUCCESS)) {
                    if (this.$storage.unshift(storable) > 100) {
                        this.$storage.pop();
                    }
                    newMessage = true;
                }

                localStorage.setItem("messages", JSON.stringify(this.$storage));
                $rootScope.$broadcast("messageUpdate");
                return newMessage;
            },

            /**
             * updates stored notification (by id) with the provided notification
             * @param  {Notification} notification  the Notification object to update
             */
            update: function (notification) {
                var storable = { id: notification.id, read: 0, date: new Date(), title: notification.title, msg: notification.msg };

                this.$storage.forEach((function (el, idx) {
                    if (el.id === notification.id) {
                        el = storable;
                    }
                }).bind(this));

                localStorage.setItem("messages", JSON.stringify(this.$storage));
                $rootScope.$broadcast("messageUpdate");
            },

            /**
             * gets all stored messages as well as number of unread messages
             * @return {object}  object containing `unreadCount` - the number of unread messages,
             *                          and `messages` - an array of stored notifications.
             */
            getMessages: function () {
                var unreadCount;

                unreadCount = this.$storage.reduce(function (prev, cur, idx, storage) {
                    cur.count = cur.count || 0;
                    return prev + (cur.count - cur.read);
                }, 0);

                return {
                    unreadCount: unreadCount,
                    messages: this.$storage
                };
            },

            /**
             * removes all stored Notifications (read and unread)
             */
            clearAll: function () {
                this.$storage = [];
                localStorage.clear();
                $rootScope.$broadcast("messageUpdate");
            }
        };

        notificationFactory = new NotificationFactory();
        return notificationFactory;
    }]);
})();
//# sourceMappingURL=controlplane.js.map