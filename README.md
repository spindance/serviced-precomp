serviced
========

Serviced is a PaaS runtime. It allows users to create, manage and scale services
in a uniform way. This platform is developed by Zenoss. Changes can be comapred 
against their respective source trees. 


Installation
------------

Given that the compile process is very invloved, this is prebuilt and hosted on 
git for easy access with our deployment platforms. 

So ideally this will be grabbed via chef, but if you're here and would like to 
take the manual route you need the following dependencies:
```
yum install -y git docker lvm2-devel pam-devel bash-completion ntp
```
It says it in the description, but incased you missed it, this is for a redhat based system. 

Then you'll install the rpms that are in the src tree

```
rpm -ivh pkg/serviced-1.2.0-0.0.x86_64.rpm ## Please note that this is compiled off of a dev branch, 
                                              so it's the 1.2 release, and while it probably provides 
                                              improvemnets, you may have issues too. 
```

```
rpm -ivh zenoss-repo-1-1.x86_64.rpm
```

(more info coming soon)

